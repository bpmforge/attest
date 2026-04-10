#!/bin/bash
# Pre-operation hook: block write/edit/grep if a loop is detected on the same file.
# Loop state is stored in .opencode-loops/state.json in the current project directory.

if [ "$OPENCODE_TOOL" = "write" ] || [ "$OPENCODE_TOOL" = "edit" ] || [ "$OPENCODE_TOOL" = "grep" ]; then
    STATE_FILE="${PWD}/.opencode-loops/state.json"

    result=$(node --input-type=module -e "
        import process from 'process';
        import fs from 'fs/promises';

        const stateFile = '${STATE_FILE}';

        try {
            const state = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
            const key = '$OPENCODE_TOOL:' + ('$OPENCODE_FILE' || '');
            const loopEntry = state.loops?.find(l => l.key === key);

            if (loopEntry && loopEntry.count >= 4) {
                console.log('⚠️ LOOP DETECTED: ' + loopEntry.count + ' attempts on ' + key);
                process.exit(1);
            }
        } catch (e) {
            // State file missing — no loop detected yet, allow operation
            process.exit(0);
        }

        process.exit(0);
    " 2>/dev/null)

    if [ $? -ne 0 ]; then
        echo "$result"
        echo "⚠️ LOOP DETECTED — Operation BLOCKED"
        echo "Try a different approach, or run: loop-detector --action reset"
        exit 1
    fi
fi

exit 0
