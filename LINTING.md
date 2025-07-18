# Linting Setup

This project has a comprehensive linting setup for both JavaScript/TypeScript and Solidity code.

## Tools Used

### JavaScript/TypeScript Linting

- **ESLint v9** with flat config format
- **Prettier** for code formatting
- **Husky** for git hooks
- **lint-staged** for pre-commit linting

### Solidity Linting

- **Solhint** for Solidity code analysis

## Available Scripts

### JavaScript Linting

```bash
# Run ESLint on all JavaScript files
npm run lint:js

# Run ESLint with auto-fix
npm run lint:js:fix
```

### Solidity Linting

```bash
# Run Solhint on all Solidity files
npm run lint:sol

# Run Solhint with auto-fix
npm run lint:sol:fix
```

### Combined Linting

```bash
# Run both JavaScript and Solidity linting
npm run lint
```

### Code Formatting

```bash
# Format all files with Prettier
npm run format

# Check if files are properly formatted
npm run format:check
```

## Configuration Files

### ESLint Configuration

- **File**: `eslint.config.js`
- **Format**: ESLint v9 flat config
- **Features**:
  - Strict code quality rules
  - Single quotes preference
  - Template literals over concatenation
  - Consistent brace style
  - Arrow function preference

### Prettier Configuration

- **File**: `.prettierrc`
- **Settings**:
  - Single quotes
  - Semicolons required
  - 100 character line width
  - 2-space indentation

### Solhint Configuration

- **File**: `.solhint.json`
- **Features**:
  - Standard Solidity best practices
  - Gas optimization warnings
  - NatSpec documentation requirements
  - Security checks

### Prettier Ignore

- **File**: `.prettierignore`
- Excludes build artifacts, dependencies, and generated files

## Pre-commit Hooks

The project uses Husky to run `lint-staged` before commits, which:

- Runs ESLint with auto-fix on JavaScript files
- Runs Solhint with auto-fix on Solidity files
- Runs Prettier on JSON, Markdown, and YAML files

## Common Issues and Solutions

### ESLint v9 Migration

This project uses ESLint v9 with the new flat config format (`eslint.config.js`). The old `.eslintrc.*` format is no longer supported.

### Import Syntax Errors

If you see "Unexpected token assert" errors, it's likely due to ES modules import assertions. Update the ESLint configuration to support newer JavaScript features if needed.

### Solidity Global Imports

Solhint warns about global imports. Consider using named imports:

```solidity
// Instead of:
import "@openzeppelin/contracts/access/Ownable.sol";

// Use:
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
```

### String Quotes

The project enforces:

- **JavaScript**: Single quotes (`'`)
- **Solidity**: Double quotes (`"`)

## Disabling Rules

### JavaScript (ESLint)

```javascript
// Disable for next line
// eslint-disable-next-line rule-name

// Disable for entire file
/* eslint-disable rule-name */
```

### Solidity (Solhint)

```solidity
// Disable for next line
// solhint-disable-next-line rule-name

// Disable for entire file
/* solhint-disable rule-name */
```

## Integration with IDEs

### VS Code

Install these extensions:

- ESLint
- Prettier - Code formatter
- Solidity

Add to your VS Code settings:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Other IDEs

Most modern IDEs support ESLint, Prettier, and Solhint. Check your IDE's documentation for setup instructions.

## Continuous Integration

The linting checks can be added to your CI pipeline:

```bash
# In your CI script
npm run lint
npm run format:check
```

This ensures code quality is maintained across all contributions.
