# TrustLens

**Live site:** https://yarmolenko08diana.github.io/TRUSTLENS-WIT-TEENS/

A magnifying glass for AI answers: find out which claims in a ChatGPT, Gemini, or other AI response you can trust.

Built by team luiqi for the “AI Trust: Can You Trust an AI Answer?” case at the WIT Teens Hackathon.
```markdown

## Features

- **Answer labeling.** Each claim gets a label: confirmed, error, looks fabricated, verify yourself, or opinion/advice.
- **Explanations.** For each statement, the tool shows what's wrong, what's correct, and the signs that reveal the problem.
- **Trusted sources.** The service detects the topic of a claim (space, health, history, Kazakhstan, and 8 more) and links to verified sites such as WHO, NASA, Britannica, stat.gov.kz, and adilet.zan.kz.
- **Source list for reports.** Sources used to check facts are compiled into a ready-made reference list.
- **Link assessment.** Links in an AI response are tagged as official site, media, social network, blog, or unknown site.
- **Trust index** from 0 to 100, plus a ready-made "double-check yourself" prompt for the same AI chat.
- **Trainer.** 14 rounds across different topics. Each game has 6 random claims, or users can play all of them.
- **Examples and custom text.** 9 ready-made examples and a "Check my text" button that clears the input field.
- **Source catalog** and five questions for evaluating any website.
- Check history, dark theme, and a mobile version.

## How the Check Works

1. The response is split into individual claims (`src/engine.js`, "Splitting" section).
2. Each claim is classified as a fact, number, quote, research reference, or opinion.
3. The engine looks for 10 signs of fabrication: research with no citation, overly precise figures, DOIs, percentages above 100, celebrity quotes, future dates, internal contradictions, absolute language, outdated data, and high cost of error.
4. Each claim is checked against a base of 72 verified facts, and calculations are recomputed. Wikipedia is used only as a hint. A match yields a "Matches Wikipedia" label, and a missing number in an article is never treated as an error.
5. The service assigns a label, writes an explanation, and calculates the trust index.

Trusted sources by topic and link assessment logic live in `src/sources.js`.

## Project Structure

```
index.html        ready-made site in one file
src/app.html      markup and styles
src/app.js        interface: report, trainer, catalog, history
src/engine.js     checking engine
src/sources.js    trusted source catalog and link assessment
src/examples.js   examples and trainer rounds
build.py          builds index.html from src/ files
tests/accuracy.js accuracy tests: truthful texts without false alarms, trainer rounds
```

Accuracy check: `node tests/accuracy.js`. Currently, 8 truthful texts (including ones about Princess Diana's death in Russian and English) pass without false alarms, and in the trainer the engine correctly judges 55 of 56 claims.

After changing files in `src/`, run `python3 build.py`. Building requires Python 3 and Node.js.

## Development Tools

| Tool | Purpose |
| --- | --- |
| Claude (Anthropic), Claude Code mode | AI coding assistant: helped write the engine and interface code, find bugs, and select examples and trainer rounds. The team set the tasks and verified the results. |
| HTML, CSS, JavaScript | The site itself, with no frameworks or server. |
| Regular expressions and rules | The checking engine works without AI, and every decision is explained by a rule in the code. |
| Python, Node.js | Building `index.html` (`build.py`) and accuracy tests (`tests/accuracy.js`). |
| Playwright + Chromium | Testing the site in a browser before publishing. |
| Git, GitHub | Code and change history. |
| Wikipedia API | Hints when checking numbers and dates. |

## Team Roles

Team: **luiqi**

| Member | Role | Responsibilities |
| --- | --- | --- |
| Yarmolenko Diana Dmitrievna | Lead Fullstack & AI Engineer | Backend, logic, and AI |
| Moldagali Zhasmina Meirmankyzy | Frontend & UI/UX Developer | Frontend, interface, and pitch |
```
