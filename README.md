# vocaml README

VOCaml is a VS Code extension providing helpers for working with [OCaml](https://ocaml.org/) code. Currently, it has three commands:

- _VOCaml: Add Type Annotations_ inserts type annotations around let bindings.
- _VOCaml: Remove Type Annotations_ removes type annotations from let bindings.
- _VOCaml: Visit File from Current Line_ triggers a _Quick Open_ dialog populated with a file and line number retrieved from the line at cursor position.

VOCaml is a companion to [`ppx_minidebug`](https://github.com/lukstafi/ppx_minidebug), but it can be used for its own merits.

## Features and Limitations

Currently, VOCaml retrieves types from the first entry of hover boxes, and uses regular expressions for parsing. Its implementation is simple, but that leads to some restrictions:

- For value bindings, only single-identier and `as`-alias bindings are supported.
- For function bindings such as `let foo bar baz = ...`, only single-identifier arguments are supported, but they can be labeled or optional. E.g. `let foo ?bar ~baz () = ...`.
- Up to 6 arguments in function bindings are supported.

## Extension Settings

Currently, VOCaml has just one exposed setting:

* `vocaml.fileLocationPattern`: a regular expression for detecting file positions.

## Release Notes

### 1.1.1

Adds labeled (and optional without defaults) arguments, unit value arguments. Fixes multiline types from hovers.

### 1.0.0

Initial release of VOCaml.
