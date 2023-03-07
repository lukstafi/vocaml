// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as removeMd from 'remove-markdown';

let fileLocationPattern =
	/"([^"]+)":([0-9]+)|"([^"]+)", line ([0-9]+),|"([^"]+)", lines ([0-9]+)-/g;

async function visitFileCurrentLine(textEditor: vscode.TextEditor) {
	const doc = textEditor.document;
	const line = doc.lineAt(textEditor.selection.active.line);
	const match = fileLocationPattern.exec(line.text);
	if (!match) return;
	await vscode.commands.executeCommand('workbench.action.quickOpen', `${match[1]}:${match[2]}`);
}

async function getTypeFromHover(doc: vscode.TextDocument, pos: vscode.Position) {
	const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider', doc.uri, pos
	);
	// use removeMd here?
	return hovers[0].contents[0].toString();
}

let bindingPattern =
	/let ([a-zA-Z_0-9\']+) =|let .+ as ([a-zA-Z_0-9\']+) =/dg;

async function addTypeAnnots(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	bindingPattern.lastIndex = 0;
	const doc = textEditor.document;
	if (textEditor.selection.isEmpty || textEditor.selection.isSingleLine) {
		const line = doc.lineAt(textEditor.selection.active.line);
		textEditor.selection = new vscode.Selection(line.range.start, line.range.end);
	}
	const text = doc.getText(textEditor.selection);
	const offset = doc.offsetAt(textEditor.selection.start);
	let matched: RegExpExecArray | null;
	while (matched = bindingPattern.exec(text)) {
		// How to supress the type error?
		const typeAtP = await getTypeFromHover(doc, doc.positionAt(offset + matched.indices[1][0] + 1));
		const insertPos = doc.positionAt(offset + matched.indices[1][1] + 1);
		edit.insert(insertPos, ': ' + typeAtP);
	}
}

let bindingWithTypePattern =
	/let ([a-zA-Z_0-9\']+) ?(: ?[^=]+)=|let .+ as ([a-zA-Z_0-9\']+) ?(: ?[^=]+)=/dg;

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
	while (matched = bindingWithTypePattern.exec(text)) {
		// How to supress the type error?
		const typePosStart = doc.positionAt(offset + matched.indices[2][0]);
		const typePosEnd = doc.positionAt(offset + matched.indices[2][1]);
		edit.replace(new vscode.Range(typePosStart, typePosEnd), '');
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
		'vocaml.addTypeAnnots', (textEditor, edit) => addTypeAnnots(textEditor, edit)));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand(
		'vocaml.removeTypeAnnots', (textEditor, edit) => removeTypeAnnots(textEditor, edit)));
}

// This method is called when your extension is deactivated
export function deactivate() {}
