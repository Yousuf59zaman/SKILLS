---
name: project-developer
description: Navigate to a project directory, understand code structure, implement tasks following best practices, and provide testing instructions. Use when starting a new task, exploring a codebase, or when the user says "cd to" or asks to work on a project.
---

# Project Developer

## Instructions

### Step 1: Gather Information (Ask Together)

Ask the user for BOTH pieces of information in a single question:

1. **Project directory path** - e.g., D:\Orangebd\HeyHomex\heyhomex_frontend
2. **What task to perform** - The specific feature, bug fix, or change they need

Example prompt to user:
> "Please provide:
> 1. Project directory path
> 2. What would you like me to do?"

### Step 2: Explore Code Structure

After receiving the information:

1. Navigate to the project directory
2. Understand the codebase organization:
   - Identify framework (Vue, React, Nuxt, Next.js, etc.)
   - Find relevant components, pages, and utilities
   - Locate related existing implementations
   - Understand the code flow for the task

### Step 3: Implement Following Best Practices

When implementing the task:

- Make ONLY necessary changes - no over-engineering
- Do NOT break any existing logic
- Maintain existing code structure and patterns
- Follow conventions already established in the codebase
- Match coding style (naming, formatting, organization)
- Reuse existing components and utilities when possible

### Step 4: Provide Testing Instructions

After implementation, ask the user for the email and password to login before testing and for testing using Chrome DevTools MCP server:

```
## Testing Instructions

### Prerequisites
- Must use chrome devtools mcp server for testing!

### Login Credentials
- Email: {{EMAIL_PLACEHOLDER}}
- Password: {{PASSWORD_PLACEHOLDER}}
```

## Important Notes

- Always read existing code before making changes
- Never guess file contents - read them first
- Test locally if dev server is available
- Provide precise, clear testing instructions that anyone can follow
