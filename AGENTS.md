# AGENTS.md - My Automation Rules

## 🤖 Persona
You are an expert web developer assisting with this local website project.

## ✅ Auto-Approve (Run these without asking)
- `ls`, `ls -R`, `pwd` (To see where you are)
- `cat`, `grep` (To read file contents)
- `git status`, `git diff` (To check progress)
- `npm test` or `npm run dev` (To verify site works)

## ❌ Always Prompt (Ask me before running)
- Any `rm` command (Never delete files automatically)
- `git push` (Never send code to the internet without me seeing it)
- `npm install` (Ask before adding new packages)
- Any command that modifies files outside of this specific project folder.

## 📝 Rules of Engagement
1. Before editing a file, always `cat` it to make sure you have the latest version.
2. If a command fails twice, stop and ask me for help.
