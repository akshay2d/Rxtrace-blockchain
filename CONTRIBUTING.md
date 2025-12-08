# Contributing to RxTrace India

Thank you for your interest in contributing to RxTrace India! This document provides guidelines and instructions for contributing to the project.

## 🎯 Project Overview

RxTrace India is a pharmaceutical traceability platform for generating GS1-compliant labels for medicine authentication. Before contributing, please familiarize yourself with:

- [README.md](./README.md) - Project overview
- [FEATURES.md](./FEATURES.md) - Complete feature documentation
- [.github/copilot-instructions.md](./.github/copilot-instructions.md) - Technical guide

## 🚫 What This Project Is NOT

Please note that this repository is specifically for the RxTrace pharmaceutical traceability platform. We **cannot** help with:

- ❌ GitHub Copilot issues
- ❌ GitHub billing or subscription questions
- ❌ VS Code configuration
- ❌ General GitHub support

For these issues, please visit [GitHub Support](https://support.github.com/).

## 🤝 How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/akshay2d/Rxtrace-blockchain/issues)
2. Use the **Bug Report** template when creating a new issue
3. Provide clear reproduction steps and environment details
4. Include screenshots if applicable

### Suggesting Features

1. Check if a similar feature has been requested
2. Use the **Feature Request** template
3. Clearly describe the use case and benefits
4. Consider if it aligns with the project's pharmaceutical focus

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following our coding standards
4. **Test thoroughly** - ensure no existing functionality breaks
5. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add batch recall feature"
   git commit -m "fix: resolve GTIN validation issue"
   ```
6. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** with a clear description

## 💻 Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- Supabase account (for database)

### Local Setup

1. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Rxtrace-blockchain.git
   cd Rxtrace-blockchain
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

### Running Tests

```bash
npm run lint    # Check code style
npm run build   # Test production build
```

## 📝 Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid `any` types when possible

### Code Style

- Follow existing code formatting
- Use ESLint (runs with `npm run lint`)
- Use Prettier for formatting (if configured)
- Use meaningful variable and function names

### Component Guidelines

- Use functional components with hooks
- Prefer `'use client'` for interactive components
- Use shadcn/ui components when possible
- Follow existing patterns in `app/dashboard/`

### File Organization

```
app/
  ├── auth/           # Authentication pages
  ├── dashboard/      # Protected dashboard pages
  ├── api/            # API routes
lib/
  ├── supabase/       # Database clients
  └── generateLabel.tsx  # Label generation logic
components/
  ├── custom/         # Project-specific components
  └── ui/             # shadcn/ui components
```

### Commit Messages

Follow conventional commit format:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build process or auxiliary tool changes

Examples:
```
feat: add serial number tracking
fix: resolve PDF generation error for large batches
docs: update API documentation
```

## 🔐 Security

- Never commit API keys, passwords, or secrets
- Use environment variables for sensitive data
- Report security vulnerabilities privately (do not open public issues)
- Follow secure coding practices

## 🧪 Testing Guidelines

- Test your changes in a development environment
- Verify authentication flows work correctly
- Test label generation with various inputs
- Check responsive design on mobile devices
- Ensure CSV upload handles edge cases
- Verify API endpoints return correct responses

## 📦 Dependencies

- Only add dependencies when necessary
- Prefer well-maintained, popular libraries
- Update package.json and package-lock.json
- Document why the dependency is needed in PR description

## 🔄 Pull Request Process

1. **Title**: Clear and descriptive (e.g., "Add batch recall management feature")
2. **Description**: Explain what, why, and how
3. **Changes**: List key changes made
4. **Testing**: Describe how you tested
5. **Screenshots**: Include for UI changes
6. **Breaking Changes**: Clearly document any breaking changes

### PR Review Checklist

- [ ] Code follows project style guidelines
- [ ] Changes are well-documented
- [ ] No unnecessary dependencies added
- [ ] Existing tests pass
- [ ] New features include appropriate documentation
- [ ] No security vulnerabilities introduced
- [ ] Commit messages follow convention

## 🎨 UI/UX Guidelines

- Follow brand colors: Blue (`#0052CC`), Orange (`#FF6B35`)
- Use Tailwind CSS utilities
- Ensure mobile responsiveness
- Maintain consistent spacing and layout
- Use shadcn/ui components for consistency
- Provide loading states for async operations
- Show clear error messages

## 📚 Documentation

When adding features:
- Update README.md if it affects getting started
- Update FEATURES.md with detailed feature description
- Add inline code comments for complex logic
- Update API documentation if adding endpoints

## ❓ Questions?

- Check existing [Issues](https://github.com/akshay2d/Rxtrace-blockchain/issues)
- Review [SUPPORT.md](./SUPPORT.md) for help resources
- Open a new issue for project-related questions
- For GitHub/Copilot questions, use [GitHub Support](https://support.github.com/)

## 🙏 Thank You!

Your contributions help improve pharmaceutical traceability and fight counterfeit medicines. Every contribution, no matter how small, is valuable!

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

**Note**: This is an open-source project for pharmaceutical traceability. It is not affiliated with GitHub, GitHub Copilot, or Microsoft.
