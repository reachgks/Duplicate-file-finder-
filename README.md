# DocuFlow: AI Document Organizer & Naming Assistant

DocuFlow is a local, interactive web application that reads corporate and project documents (Excel, Word, PDF, PowerPoint) from any folder on your laptop/PC, analyzes their content using Gemini AI, classifies them into contexts, suggests standardized names, builds clean folder hierarchies, executes safe copy-and-rename operations, and provides a confirmed cleanup utility to delete original files.

---

## 🌟 Key Features

1. **Local Folder Browsing:** Integrates with the native OS file browser to safely pick any directory on your laptop or PC.
2. **Deep Document Parsing:** Reads text, headers, and slide structures from:
   - **Adobe PDF** (`.pdf`) using `pypdf`
   - **Microsoft Word** (`.docx`, `.doc`) using `python-docx`
   - **Microsoft PowerPoint** (`.pptx`, `.ppt`) using `python-pptx`
   - **Microsoft Excel** (`.xlsx`, `.xls`) using `openpyxl`
3. **AI Context Classification:** Utilizes Gemini AI (`gemini-1.5-flash`) to detect document categories:
   - *Customer Proposal*
   - *Customer Presentation*
   - *Internal Presentation*
   - *Knowledge Artifact*
   - *Other*
4. **Dynamic Naming Standards:** Configures a custom template structure (e.g., `{Category}_{Client}_{Description}_{Date}`) and automatically replaces tokens with sanitized values.
5. **Interactive Grid Preview:** Displays scanned files in an editable tabular UI. Change suggested names or target paths inline before running any action.
6. **Safe Execution Mode:** Copies and renames files to the new folder structure. It **never** alters original files or overwrites existing target documents.
7. **Clean-Up Manager:** Provides a visual registry of original files, allowing checkbox selection and a double-confirmation modal before performing local file deletions.

---

## 📁 Repository Structure

```text
e:\Antigravity\
├── backend/
│   ├── main.py            # FastAPI main server, endpoint routing, Tkinter wrapper
│   ├── parser.py          # Document content text extraction utilities
│   └── requirements.txt   # Python dependency list
├── frontend/
│   ├── index.html         # Premium HTML5 structures & semantic grids
│   ├── style.css          # Glassmorphic dark mode styling & animations
│   └── app.js             # Client-side state machine, API workers, table builders
├── run.bat                # Windows bootstrapper script
└── README.md              # Comprehensive developer guide (this file)
```

---

## 🛠️ Step-by-Step Implementation Guide

### Step 1: Set up the Python Backend Dependencies (`backend/requirements.txt`)
We declare standard libraries for building the API and extracting content from files.
- `fastapi` & `uvicorn` serve the local API and frontend files.
- `pypdf` extracts texts from PDF pages.
- `python-docx` handles `.docx` body text and tables.
- `python-pptx` reads text shapes and titles from PowerPoint slides.
- `openpyxl` accesses worksheets and sample cell contents.
- `google-generativeai` interfaces with Gemini for document analysis.

### Step 2: Implement the Document Parser (`backend/parser.py`)
This module handles reading file contents.
- **PDF Extraction:** Reads pages sequentially and concatenates content up to a token-efficient limit (4000 characters).
- **Word Extraction:** Reads text from document paragraphs and handles cell paragraphs inside tables.
- **PowerPoint Extraction:** Iterates through presentation slides and pulls text frames from all shapes.
- **Excel Extraction:** Returns sheet names and pulls values from the first sheet's header rows to help the LLM recognize the content context.
- **Legacy Fallback Method:** For binary formats (`.doc`, `.xls`, `.ppt`), it reads the byte stream and isolates sequences of readable ASCII/UTF-8 printables. This captures meta-titles, client names, and text headers inside binary files without requiring complex OS dependencies.

### Step 3: Implement the FastAPI Application (`backend/main.py`)
Exposes API routes to drive the UI:
- **`GET /api/browse-folder`:** Instantiates a minimized `tkinter.Tk` window and launches a native Windows `filedialog.askdirectory` browser to comfortably select local folders.
- **`POST /api/scan`:** Performs `os.walk` in the selected path and compiles details of supported extensions.
- **`POST /api/classify-file`:** Passes the extracted document text to Gemini with a highly descriptive prompt constraining the format to structured JSON output (`application/json`).
- **`POST /api/execute`:** Performs a `shutil.copy2` copy of selected items to the new folder structure. It checks if target files already exist, appending a numeric counter (e.g., `_1`, `_2`) if needed, ensuring zero file collisions or loss.
- **`POST /api/delete-originals`:** Exposes a deletion hook using `os.remove` only triggered after explicit confirmation.
- **Static Mounting:** Serves the frontend directory directly at the root `/` path.

### Step 4: Build the Frontend Layout (`frontend/index.html` & `frontend/style.css`)
- **Visual Design:** Leverages a modern "glassmorphism" design system. The background features deep space-gradient shades (`hsl(245, 40%, 6%)`) overlaid with floating glowing blur shapes. Cards use thin borders, transparent backdrops, and `backdrop-filter: blur(16px)`.
- **Aesthetics & Feedback:** Features custom checkboxes, pulsing status badges, neon accents, and interactive tabs. Color-coded badges instantly identify file types (red for PDF, blue for Word, green for Excel, orange for PPT) and categories (cyan for proposals, emerald for knowledge base, indigo for pitches).
- **Inline Editing:** Table grids feature custom border-dashed text inputs, allowing direct editing of file names or folders.

### Step 5: Implement UI Logic (`frontend/app.js`)
Handles states and endpoints:
- **Local Settings:** Persists the Gemini API Key, standard templates, and folder organization styles inside local browser `localStorage`.
- **Concurrency Pooling:** Uses a worker queue limit of `3` to classify checked items simultaneously, updating statuses dynamically row-by-row.
- **Action Triggers:** Routes results from classification directly into the execution grid, compiles successful transfers into the cleanup registry, and manages modals for safe deletion.

---

## 🚀 Running the Application

1. Double-click the **`run.bat`** file in the root folder.
2. The script will automatically:
   - Detect your local Python installation.
   - Construct a isolated virtual environment (`.venv`).
   - Install all required libraries listed in `requirements.txt`.
   - Boot up the local FastAPI server on port `8000`.
   - Automatically launch your system's browser pointing to `http://localhost:8000`.
3. In the UI, click **Settings**, paste your **Gemini API Key**, and customize your naming template if desired.
4. Click **Browse...** to select your target documents folder.
5. Click **Scan Folder** to load files, select the files you want to organize, and click **Classify Selected**.
6. Review the suggested names and directories, check files in the **Rearrange & Execute** tab, and click **Run Move/Rename Execution**.
7. Go to the **Source Clean-Up** tab, review the files, click **Delete Selected Originals**, and confirm the deletion.
