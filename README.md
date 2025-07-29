# CodePack

CodePack is a desktop tool for merging multiple source files into a single text file and splitting such bundles back into their original structure. It is built with Electron and supports multiple languages (English, Russian, Romanian).

## Features

- **Merge files** from folders or individual selections into one file with clear separators.
- **Split** a bundled file back into folders/files using the same separators.
- **Tree view** with checkboxes, drag & drop support and file type icons.
- **Custom filters** for file extensions and ignore patterns (`node_modules`, `user-data`, etc.).
- **Relative or absolute paths** in the output file.
- **Persistent settings** stored between sessions.
- **Two viewing modes** when unpacking: all files as a single stream or one file at a time.
- **Keyboard shortcuts** for quick navigation.

## Installation

1. Install Node.js (version 18 or later recommended).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the application:
   ```bash
   npm start
   ```

The app will open in a desktop window.

## Translations

All interface text is stored in the `locales/` directory. To add a new language, create a new JSON file with the required keys (see existing files for reference) and restart the app.

## License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.
