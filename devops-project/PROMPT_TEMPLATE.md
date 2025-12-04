# Task: Implement AWS CDK Infrastructure and CI/CD

## Project Context
You are implementing a 5-stack AWS CDK application with platform-agnostic CI/CD pipelines. All build/test/deploy logic must reside in portable shell scripts, with GitHub Actions serving only as an orchestration layer.

## Context Files
1. **THE_PLAN.md**: Your implementation checklist with all tasks
2. **CLAUDES_INSTRUCTIONS.md**: Your operational constraints and quality standards

## Instructions
1. Open and read `THE_PLAN.md` to understand all pending tasks
2. Read `CLAUDES_INSTRUCTIONS.md` to understand constraints and rules
3. Identify the next unchecked task in `THE_PLAN.md`
4. Complete the task fully (write code, create files, test, etc.)
5. Verify your work meets the quality standards
6. Update `THE_PLAN.md` to mark the task as complete (`- [x]`)
7. Repeat steps 3-6 until all tasks are done

## Critical Rules
- Follow ALL constraints in `CLAUDES_INSTRUCTIONS.md`
- Complete tasks sequentially - do not skip ahead
- Do not batch task completions - mark each task complete immediately after finishing it
- Verify your work before marking tasks complete
- Never hardcode AWS Account IDs, Regions, or resource names
- GitHub Actions workflows must ONLY call shell scripts (no inline logic)
- Do not create new Markdown documentation files unless explicitly requested

## Success Criteria
- All checkboxes in `THE_PLAN.md` are marked complete (`- [x]`)
- All CDK stacks deploy successfully
- All shell scripts are portable and work on ubuntu-latest
- All GitHub Actions workflows trigger correctly based on path changes
- All configuration is externalized and environment-agnostic

Begin by reading `THE_PLAN.md` and starting with the first pending task in Phase 0.
