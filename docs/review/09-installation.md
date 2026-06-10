[🏠 Index](README.md)  |  [← Validation Gate System](08-validators.md)  |  [Code Health Findings →](10-code-health.md)

---

# 9. Installation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant IS as install.sh
    participant GH as GitHub / Gitea
    participant FS as ~/.config/opencode/
    participant NPM as npm
    participant SEMP as semgrep (optional)

    U->>GH: git clone bpm-opencode-experts
    U->>IS: ./install.sh [--project] [--link] [--semgrep] [--pullmd]

    IS->>IS: Platform check (macOS/Linux/WSL only)
    IS->>IS: Parse flags: MODE, METHOD, INSTALL_SEMGREP

    alt MODE = global (default)
        IS->>FS: Create ~/.config/opencode/{agents,skills,tools,commands,references,scripts,plugins}/
        IS->>FS: Copy / symlink agents/*.md
        IS->>FS: Copy / symlink skills/**
        IS->>FS: Copy / symlink tools/*.ts
        IS->>FS: Copy / symlink plugins/expert-hooks.ts
        IS->>FS: Copy / symlink references/*.md
        IS->>FS: Copy / symlink scripts/
    else MODE = project
        IS->>FS: Create .opencode/ in current directory
        IS->>FS: Copy / symlink to .opencode/
    end

    IS->>FS: Register plugin in opencode.json
    IS->>NPM: npm install (for plugin dependencies)

    alt INSTALL_SEMGREP = true
        IS->>SEMP: Install semgrep binary
        IS->>SEMP: Clone community rules (trailofbits, elttam, gitlab, 0xdea)
        IS->>FS: Copy 186 custom rules to ~/.config/opencode/.semgrep/
    end

    IS->>IS: Run validate-tools.js (verify all tools have valid exports)
    IS-->>U: Installation complete
```

---

---

[🏠 Index](README.md)  |  [← Validation Gate System](08-validators.md)  |  [Code Health Findings →](10-code-health.md)
