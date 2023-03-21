// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import { type } from 'os';
import * as vscode from 'vscode';

let fileLocationPattern =
	/"([^"]+)"(?::|, line |, lines )([0-9]+)/g;

async function visitFileCurrentLine(textEditor: vscode.TextEditor) {
	const doc = textEditor.document;
	const line = doc.lineAt(textEditor.selection.active.line);
	const match = fileLocationPattern.exec(line.text);
	if (!match) { return; }
	await vscode.commands.executeCommand(
		'workbench.action.quickOpen', `${match[1]}:${match[2]}`);
}

async function getTypeFromHover(doc: vscode.TextDocument, pos: vscode.Position) {
	const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider', doc.uri, pos
	);
	const hover = hovers[0].contents[0];
	let val = typeof hover === 'string' ? hover : hover.value;
	val = val.replace('```ocaml', '');
	val = val.replace('```', '');
	val = val.replace('`', '');
	return val.trim();
}

// Partition the full pattern into groups for easier computing of positions.
// (There is an 'indices' field on match results we could use, but it is not fully supported yet.)

// Handles function let-bindings with up to 6 arguments (no non-identifier patterns).
let bindingPattern =
	/(let(?:%[.a-zA-Z0-9_]+)?\s+(?:~|\?)?)([a-zA-Z_0-9']+)(\s+(?:~|\?)?([a-zA-Z_0-9']+))?(\s+(?:~|\?)?([a-zA-Z_0-9']+))?(\s+(?:~|\?)?([a-zA-Z_0-9']+))?(\s+(?:~|\?)?([a-zA-Z_0-9']+))?(\s+(?:~|\?)?([a-zA-Z_0-9']+))?(\s+(?:~|\?)?([a-zA-Z_0-9']+))?(\s*=)/g;

let bindingAsPattern =
	/(let(?:%[.a-zA-Z0-9_]+)? .+ as )([a-zA-Z_0-9']+)(\s*=)/g;

function nthGroupPos(n: number, doc: vscode.TextDocument, offset: number, match: RegExpExecArray,
	delta: number = 0) {
	const indices = (match as any)?.indices;
	let result = offset + indices[n][0] + delta;
	return doc.positionAt(result);
}
function nthGroupRange(n: number, doc: vscode.TextDocument, offset: number, match: RegExpExecArray) {
	const indices = (match as any)?.indices;
	const beg = doc.positionAt(offset + indices[n][0]);
	const end = doc.positionAt(offset + indices[n][1]);
	return new vscode.Range(beg, end);
}

async function addTypeAnnots(textEditor: vscode.TextEditor) {
	bindingPattern.lastIndex = 0;
	const doc = textEditor.document;
	if (textEditor.selection.isEmpty || textEditor.selection.isSingleLine) {
		const line = doc.lineAt(textEditor.selection.active.line);
		textEditor.selection = new vscode.Selection(line.range.start, line.range.end);
	}
	const text = doc.getText(textEditor.selection);
	const offset = doc.offsetAt(textEditor.selection.start);
	let matched: RegExpExecArray | null;
	let edits: {pos: vscode.Position | vscode.Range, txt: string}[] = [];
	while ((matched = bindingPattern.exec(text)) || (matched = bindingAsPattern.exec(text))) {
		// Group 1 is the let-keyword. Group 4 is the first function arg, group 3 is its surrounding
		// whitespace and optional (label) tilde.
		let numArgs = 0;
		for (let i = 4; i < matched.length - 3; i += 2) {
			if (!matched[i]) { continue; }
			++numArgs;
			let argPos = nthGroupPos(i, doc, offset, matched, 1);
			const argType = await getTypeFromHover(doc, argPos);
			if (!argType) { continue; }
			edits.push({
				pos: nthGroupRange(i, doc, offset, matched),
				txt: '(' + matched[i] + ': ' + argType + ')'
			});
		}
		let retType = await getTypeFromHover(doc, nthGroupPos(2, doc, offset, matched, 1));
		if (!retType) { continue; }
		if (numArgs > 0) {
			let types = retType.split('->');
			types = types.slice(numArgs);
			retType = types.join('->');
		}
		edits.push({
			pos: nthGroupPos(matched.length - 1, doc, offset, matched),
			txt: ': ' + retType.trim()
		});
	}
	await textEditor.edit(edit => {
		for (const ins of edits) {
			if (ins.pos instanceof vscode.Position) {
				edit.insert(ins.pos, ins.txt);
			} else {
				edit.replace(ins.pos, ins.txt);
			}
		}
	});
}

// Handles function let-bindings with up to 6 arguments (no non-identifier patterns).
let bindingWithTypePattern =
	/(let(?:%[.a-zA-Z0-9_]+)? )([a-zA-Z_0-9']+)((\s*(?:~|\?)?)\(([a-zA-Z_0-9']+)\s*:\s*[^=]+?\))?((\s*(?:~|\?)?)\(([a-zA-Z_0-9']+)\s*:\s*[^=]+?\))?((\s*(?:~|\?)?)\(([a-zA-Z_0-9']+)\s*:\s*[^=]+?\))?((\s*(?:~|\?)?)\(([a-zA-Z_0-9']+)\s*:\s*[^=]+?\))?((\s*(?:~|\?)?)\(([a-zA-Z_0-9']+)\s*:\s*[^=]+?\))?((\s*(?:~|\?)?)\(([a-zA-Z_0-9']+)\s*:\s*[^=]+?\))?(\s*:\s*[^=]+)=/g;
let bindingWithTypeAsPattern =
	/(let(?:%[.a-zA-Z0-9_]+)? .+\s+as\s+)([a-zA-Z_0-9']+)(\s+:\s*[^=]+)=/g;

async function removeTypeAnnots(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	bindingWithTypePattern.lastIndex = 0;
	const doc = textEditor.document;
	if (textEditor.selection.isEmpty || textEditor.selection.isSingleLine) {
		const line = doc.lineAt(textEditor.selection.active.line);
		textEditor.selection = new vscode.Selection(line.range.start, line.range.end);
	}
	const text = doc.getText(textEditor.selection);
	const offset = doc.offsetAt(textEditor.selection.start);
	let matched: RegExpExecArray | null;
	while ((matched = bindingWithTypePattern.exec(text)) ||
		(matched = bindingWithTypeAsPattern.exec(text))) {
  	// We could replace backwards so that positions are valid at the time of replacement...
		for (let i = 3; i < matched.length - 3; i += 3) {
			if (!matched[i] || !matched[i+2]) { continue; }
			edit.replace(nthGroupRange(i, doc, offset, matched),
				(matched[i + 1] ? matched[i + 1] : '') + matched[i + 2]);
		}
		const retTypeN = matched.length - 1;
		edit.replace(nthGroupRange(retTypeN, doc, offset, matched), ' ');
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "vocaml" is now active!');

	const configuration = vscode.workspace.getConfiguration();
	const fileLocationPatternConfig = configuration.get<string>("vocaml.fileLocationPattern");
	if (fileLocationPatternConfig) {
		fileLocationPattern = new RegExp(fileLocationPatternConfig, 'u');
	}
	context.subscriptions.push(vscode.commands.registerTextEditorCommand(
		'vocaml.visitFileCurrentLine', textEditor => visitFileCurrentLine(textEditor)));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand(
		'vocaml.addTypeAnnots', textEditor => addTypeAnnots(textEditor)));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand(
		'vocaml.removeTypeAnnots', (textEditor, edit) => removeTypeAnnots(textEditor, edit)));
}

// This method is called when your extension is deactivated
export function deactivate() {}
