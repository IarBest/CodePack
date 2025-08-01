# AGENT INSTRUCTIONS

This file captures the current state of the project and ongoing plans. Update
this file after each significant change so that future sessions know what has
already been implemented and what tasks remain.

## Summary

CodePack is an Electron desktop app that merges multiple source files into a
single text file and can split such bundles back to their original structure.
It features a two-column interface with "Merge" and "Split" tabs, drag & drop,
a tree view with checkboxes, persistent settings, and a CodeMirror-based code
viewer/editor. Translations exist for English, Russian and Romanian.

Recent work added a .gitignore, improved localization strings, and implemented a
CodeMirror viewer with navigation and search. The fullscreen button now expands
only the code viewer with a smooth 0.2s animation and can be toggled via the
Alt+Enter hotkey. The Escape key now closes the search panel before exiting
fullscreen. Search panel code now waits for the panel DOM to mount and retries
until the "whole word" option is available before inserting the "search in all
files" checkbox. The checkbox is inserted right after that option for a more
natural layout. The patch now looks for the panel in the dedicated search
container instead of inside the editor DOM so the checkbox reliably appears.

## Planned Work

- Polish existing features and fix minor issues.