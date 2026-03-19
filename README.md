# Illumio Rule Review — Browser Extension

A browser extension for Illumio PCE that adds **inline rule‑review tooling** and workflow helpers directly into the UI to make reviewing Traffic and policy rules faster and more practical.

This project is intended for **power users, engineers, and administrators** who routinely analyze and review Illumio Traffic and policy behavior and want lightweight, browser‑side tooling to reduce friction.

---

## ⚠️ Beta Software Notice

**BETA SOFTWARE — PROVIDED AS IS**

This project is **experimental** and provided **without guarantees**, **without support**, and **without any SLA**.

- Behavior may change without notice  
- No guarantees of correctness, stability, availability, or fitness for any purpose  
- No support is provided  
- No Service Level Agreement (SLA) is offered  

Use at your own risk.

---

## ✨ Features (High‑Level)

- Injects review‑oriented UI helpers directly into Illumio pages
- Adds controls that streamline the **Policy** review workflow
- Designed to be lightweight and non‑intrusive
- Runs entirely client‑side as a browser extension

> This extension does **not** automatically modify backend state. Any actions taken are explicitly user‑initiated through the UI.

---

## 🛠️ Installation

### Firefox (Install Add‑on From File)

1. Clone or download this repository.
2. Open Firefox and navigate to:
   ```
   about:addons
   ```
3. Click the **⚙️ (gear icon)** in the top‑right corner.
4. Select **Install Add‑on From File…**
5. Navigate to the `firefox/` directory in this repository and select the `.xpi` file.
6. Confirm the installation when prompted.
7. Refresh page and navigate to the **Policies** page or open any **Ruleset** in the Illumio UI.
8. Verify the extension is working:
   - Each rule row should display a **magnifying glass** icon.
   - The **Policies** page and **Ruleset** pages should display a **Review** button in the top‑right corner.

---

### Chromium‑Based Browsers (Chrome, Edge, Brave)

1. Clone or download this repository.
2. Open the browser extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable **Developer mode** (top‑right corner).
4. Click **Load unpacked**.
5. Select the `chromium/` extension directory in this repository containing:
   - `content.js`
   - `background.js`
   - `manifest.json`
6. Verify the extension is loaded and enabled.
7. Refresh page and navigate to the **Policies** page or open any **Ruleset** in the Illumio UI.
8. Verify the extension is working:
   - Each rule row should display a **magnifying glass** icon.
   - The **Policies** page and **Ruleset** pages should display a **Review** button in the top‑right corner.

---

## ▶️ Usage

1. Open the **Policies**, or an individual **Ruleset** page in the Illumio UI.
3. Interact with the extension using either:
   - The **magnifying glass** icon on an individual rule row, or
   - The **Review** button in the top‑right corner of the **Policies** or **Ruleset** page.
4. A review **HUD** will be displayed, which automatically:
   - Reviews the selected rule
   - Displays the associated Traffic query
   - Evaluates whether the rule qualifies for disablement due to **no traffic observed for 90 days**
   - Identifies opportunities to **tighten IP Lists**, when applicable
   - The extension will automatically **disable or update the rule** as appropriate.
   - All changes are performed in **draft state only**.
   - **No provisioning or enforcement is ever performed by the extension.**

---

## 🧪 Debugging

Open browser DevTools on the **same tab** where Illumio is loaded and switch to the **Console**. Content‑script logs appear in the **page’s** DevTools, not on the extensions/add‑ons management page.

### How logs are formatted
Logs are emitted as **JSON objects with a single key** (label) and an object payload. Examples:
```json
{"dom_rule_snapshot":{"ruleset_id":"123","rule_number":"42", "...": "..."}}
{"async_query_poll":{"status":"completed","href":"..."}}
{"disable_rule_put":{"attempt":"minimal","ok":true,"status":200,"href":"..."}}```

---

## ⚠️ Limitations & Disclaimer

- **BETA SOFTWARE** — behavior may change without notice
- No guarantees of accuracy, availability, or fitness for any purpose
- No support is provided
- UI depends on the pages DOM structure
- Backend availability is not guaranteed

---

## 📄 License

Licensed under the **Apache License, Version 2.0**.

This software is provided **“AS IS”**, without warranties or conditions of any kind, either express or implied. See the LICENSE file for full details.
