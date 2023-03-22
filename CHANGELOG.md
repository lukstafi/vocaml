# Change Log

## [1.1.2] -- 2023-03-22

### Fixed

- `let rec` patterns.

## [1.1.1] -- 2023-03-21

### Changed

- Handle the unit value argument.
- Update README.

## [1.1.0] -- 2023-03-21

### Fixed

- Multiline types in hovers.

### Changed

- Handle labelled arguments, but only if the label is the same as the identifier, and optional arguments without default values.
  - So, only arguments of the form `~arg` and `?arg`.

## [1.0.0] -- 2023-03-08

### Added

- Initial release.
- Add / remove type annotations to let-bindings in the current line or in the selection.
- Handle function definitions, but only when the arguments are identifiers.
- Parsing multi-line types from hovers is broken.
- Go-to file location from a link in the current line.