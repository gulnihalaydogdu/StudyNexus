# StudyNexus - Weekly Planner Canvas 📅✨

StudyNexus is a premium, interactive weekly study planning web application designed with a sleek, modern layout using a soft lilac/lavender aesthetic. Built using **Node.js, Express, EJS, and SQLite (or SQLite3)**, it offers a dynamic drag-and-drop workspace where students or educators can craft clean, personalized study schedules.

---

## 🎨 Core Features

### 🌟 1. Interactive Drag-and-Drop Canvas (A4 Format)
* **Visual Tuval:** A full-scale A4-styled planner canvas where you can intuitively drag courses and topics from your pending sidebar directly into specific days of the week.
* **Dynamic Layouts:** Rows automatically adjust their sizes and switch between compact lists and multiple column grids based on the density of items per day, ensuring a pristine UI/UX.

### 🗂️ 2. Paper-Textured Stack View (The Pile)
* **Card Stack Concept:** Saved weekly plans are displayed as a floating, paper-textured 3D stack. Hovering over the deck dynamically unpacks them like a deck of cards, letting you access any previous plan with a single click.

### 🗓️ 3. Dynamic Mini-Calendar Grid
* **Automated Roll-over:** A smart calendar view that automatically fetches the current month and calculates the subsequent two months.
* **Senkronize Atamalar:** Seamlessly links any created weekly plan to a specific week on the calendar grid, highlighting assigned weeks with a dedicated indicator. Clicking a filled week triggers the quick look modal.

### 🔍 4. True-to-Design Quick Look (WYSIWYG)
* **A4 Fidelity Modal:** When opening an existing plan, it renders exactly in the original A4 format with color-coded day initials instead of a generic text list. It includes seamless inline description overflows and instant state senkronizasyonu for plan deletions.

### 📥 5. High-Definition PDF Export
* **HD Snapshot:** Integrated with `html2canvas` and `jsPDF` to download your current week's plan as a clean, pixel-perfect PDF file, with temporary style resets during generation to ensure no inputs or actions appear blurry.

---

## 🛠️ Tech Stack & Architecture

* **Frontend:** HTML5, CSS3 (Custom Properties, Grid, Flexbox, Advanced Mask Gradients, Composite Filters), JavaScript (ES6+ Native Drag and Drop API)
* **Templating Engine:** EJS (Embedded JavaScript templates)
* **Backend:** Node.js, Express framework
* **Database:** SQLite / SQLite3 (Relational structure mapping courses, topics, study plans, and calendar events)
* **Authentication:** Middleware-enforced session-based user authentication (`requireAuth`)

---

## 🚀 Getting Started

Follow these steps to run StudyNexus locally on your machine:

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed on your computer.

### 2. Installation
Clone the repository and install the required modules:
```bash
git clone [https://github.com/YOUR_USERNAME/StudyNexus.git](https://github.com/YOUR_USERNAME/StudyNexus.git)
cd StudyNexus
npm install
