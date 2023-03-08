// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
// import { type } from 'os';
import * as vscode from 'vscode';

let fileLocationPattern =
	/"([^"]+)":([0-9]+)|"([^"]+)", line ([0-9]+),|"([^"]+)", lines ([0-9]+)-/g;

async function visitFileCurrentLine(textEditor: vscode.TextEditor) {
	const doc = textEditor.document;
	const line = doc.lineAt(textEditor.selection.active.line);
	const match = fileLocationPattern.exec(line.text);
	if (!match) { return; }
	await vscode.commands.executeCommand('workbench.action.quickOpen', `${match[1]}:${match[2]}`);
}

let markdownPattern =
	/^```ocaml\s*(.+)\s*```|^`\s*(.+)\s*`$/;

async function getTypeFromHover(doc: vscode.TextDocument, pos: vscode.Position) {
	const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider', doc.uri, pos
	);
	const hover = hovers[0].contents[0];
	const val = typeof hover === 'string' ? hover : hover.value;
	let match = markdownPattern.exec(val);
	if (!match) { return null; }
	return match[1];
}

// Partition the full pattern into groups for easier computing of positions.
// (There is an 'indices' field on match results we could use, but it is not fully supported yet.)

// Handles function let-bindings with up to 6 arguments (no non-identifier patterns).
let bindingPattern =
	/(let )([a-zA-Z_0-9']+)(\s+[a-zA-Z_0-9']+)?(\s+[a-zA-Z_0-9']+)?(\s+[a-zA-Z_0-9']+)?(\s+[a-zA-Z_0-9']+)?(\s+[a-zA-Z_0-9']+)?(\s+[a-zA-Z_0-9']+)?\s*=/g;

let bindingAsPattern =
	/(let .+ as )([a-zA-Z_0-9']+)\s*=/g;

function nthGroupPos(n: number, doc: vscode.TextDocument, offset: number, match: RegExpExecArray,
	delta: number = 0) {
	let result = offset + match.index;
	for (let i = 1; i < n; ++i) {
		if (match[i]) { result += match[i].length; }
	}
	return doc.positionAt(result + delta);
}
function nthGroupRange(n: number, doc: vscode.TextDocument, offset: number, match: RegExpExecArray) {
	return new vscode.Range(nthGroupPos(n, doc, offset, match), nthGroupPos(n + 1, doc, offset, match));
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
	let edits: {pos: vscode.Position, txt: string}[] = [];
	while ((matched = bindingPattern.exec(text)) || (matched = bindingAsPattern.exec(text))) {
		// Group 1 is the let-keyword. Group 3 is the first arg binding for functions.
		let numArgs = 0;
		for (let i = 3; i < matched.length; i++) {
			if (!matched[i]) { continue; }
			++numArgs;
			const argType = await getTypeFromHover(doc, nthGroupPos(i, doc, offset, matched, 1));
			if (!argType) { continue; }
			edits.push({
				pos: nthGroupPos(i + 1, doc, offset, matched),
				txt: ' (' + matched[i].trim() + ': ' + argType + ')'
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
			pos: nthGroupPos(matched.length, doc, offset, matched),
			txt: ': ' + retType.trim()
		});
	}
	await textEditor.edit(edit => {
		for (const ins of edits) {
			edit.insert(ins.pos, ins.txt);
		}
	});
}

// Handles function let-bindings with up to 6 arguments (no non-identifier patterns).
let bindingWithTypePattern =
	/(let )([a-zA-Z_0-9']+)(\s*\([a-zA-Z_0-9']+\s*:\s*[^)]+\))?(\s*\([a-zA-Z_0-9']+\s*:\s*[^)]+\))?(\s*\([a-zA-Z_0-9']+\s*:\s*[^)]+\))?(\s*\([a-zA-Z_0-9']+\s*:\s*[^)]+\))?(\s*\([a-zA-Z_0-9']+\s*:\s*[^)]+\))?(\s*\([a-zA-Z_0-9']+\s*:\s*[^)]+\))?(\s*:\s*[^=]+)=/g;
let bindingWithTypeAsPattern =
	/(let .+\s+as\s+)([a-zA-Z_0-9']+)(\s+:\s*[^=]+)=/g;

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
