import os
import shutil
import datetime
from typing import List, Optional
import tkinter as tk
from tkinter import filedialog
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from parser import extract_file_content

app = FastAPI(title="Document Organizer & Renamer API")

# Configure CORS so we can develop frontend and backend separately if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Models
class ScanRequest(BaseModel):
    folder_path: str

class ClassifyRequest(BaseModel):
    file_path: str
    api_key: str
    naming_template: str  # e.g., "{Category}_{Client}_{Description}_{Date}"

class ExecuteItem(BaseModel):
    original_path: str
    suggested_name: str
    suggested_folder: str

class ExecuteRequest(BaseModel):
    items: List[ExecuteItem]
    base_folder: str

class DeleteRequest(BaseModel):
    file_paths: List[str]

# Helper to open tkinter folder picker in a safe way
def select_folder_native() -> str:
    root = tk.Tk()
    root.withdraw()  # Hide main window
    root.attributes('-topmost', True)  # Bring window to front
    folder_path = filedialog.askdirectory(title="Select Folder to Scan")
    root.destroy()
    return folder_path

@app.get("/api/browse-folder")
async def browse_folder():
    """Opens a native OS folder picker and returns the selected folder path."""
    try:
        # Tkinter requires a UI mainloop environment, this runs synchronously
        # but is safe in a local environment.
        folder = select_folder_native()
        return {"folder_path": folder}
    except Exception as e:
        # If Tkinter is not available or errors, return an empty string
        # and let the user input it manually.
        raise HTTPException(
            status_code=500, 
            detail=f"Could not open native folder selector: {str(e)}. Please type the path manually."
        )

@app.post("/api/scan")
async def scan_directory(req: ScanRequest):
    """Scans the directory for supported office files."""
    folder = req.folder_path
    if not os.path.exists(folder):
        raise HTTPException(status_code=404, detail="Directory does not exist.")
    if not os.path.isdir(folder):
        raise HTTPException(status_code=400, detail="Path is not a directory.")

    supported_extensions = {".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls"}
    files_list = []

    try:
        for root, dirs, files in os.walk(folder):
            for file in files:
                _, ext = os.path.splitext(file.lower())
                if ext in supported_extensions:
                    full_path = os.path.join(root, file)
                    stat = os.stat(full_path)
                    files_list.append({
                        "filename": file,
                        "relative_path": os.path.relpath(full_path, folder),
                        "absolute_path": full_path,
                        "size_bytes": stat.st_size,
                        "modified_time": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "extension": ext
                    })
        return {"files": files_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan folder: {str(e)}")

@app.post("/api/classify-file")
async def classify_file(req: ClassifyRequest):
    """Reads a file, calls Gemini API to extract details and generate name/folder."""
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="File does not exist.")

    # 1. Extract content text from file
    text_content = extract_file_content(req.file_path)
    
    # 2. Setup Gemini SDK client
    import google.generativeai as genai
    
    try:
        genai.configure(api_key=req.api_key)
        # Using gemini-1.5-flash for rapid, lightweight text classification
        model = genai.GenerativeModel("gemini-1.5-flash")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gemini API initialization failed: {str(e)}")

    current_date = datetime.datetime.now().strftime("%Y%m%d")
    
    # Create the LLM prompt
    prompt = f"""
You are an expert document organizer. Your task is to analyze the content of a file, classify it into one of the designated categories, and extract details to construct a standardized file name and a suggested subfolder.

Categories:
1. "Customer Proposal" - Bids, proposals, quotes, or statements of work (SOW) sent to clients.
2. "Customer Presentation" - Slides or pitch decks designed for clients.
3. "Internal Presentation" - Slides or briefs for internal team review or company updates.
4. "Knowledge Artifact" - Whitepapers, templates, guides, research, standard operating procedures (SOP), or design documentation.
5. "Other" - Anything else that doesn't fit the above categories.

File Name: "{os.path.basename(req.file_path)}"
Extracted File Text (first 4000 chars):
--- START OF TEXT ---
{text_content[:4000]}
--- END OF TEXT ---

Naming Standard Template: "{req.naming_template}"
The template fields to extract and replace in the template are:
- `Category`: Choose exactly one of the 5 categories listed above.
- `Client`: The name of the client or customer associated with this document. If it is internal or has no clear client, use "Internal" or "General".
- `Description`: A concise description of the file contents (2-3 words, lowercase, separate words with hyphens).
- `Date`: An extracted date in YYYYMMDD format. If no date is mentioned in the text, use the current date "{current_date}".

Please output your response strictly as a JSON object. Ensure the output is valid JSON and matching the schema:
{{
  "category": "The selected category name (e.g., Customer Proposal)",
  "client_name": "The extracted client name or 'Internal'/'General'",
  "description": "A concise description (e.g., website-overhaul)",
  "date": "YYYYMMDD",
  "suggested_name": "The complete filename (without extension) built strictly according to the Naming Standard Template. Replace templates like {{Category}}, {{Client}}, {{Description}}, {{Date}} with the extracted values. Clean up special characters, replace spaces with hyphens, and keep it neat.",
  "suggested_folder": "The recommended subfolder name. You can use 'Category' as folder name (e.g., 'Customer Proposals'), or structure it as 'Client Name/Category' if there is a distinct client.",
  "reasoning": "A 1-sentence explanation of why this category was chosen based on the text."
}}
"""

    try:
        # Call the Gemini model with a structured JSON response constraint
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Parse output
        import json
        result = json.loads(response.text.strip())
        return result
    except Exception as e:
        # Gracefully capture API errors and return a format the UI can display
        return {
            "category": "Other",
            "client_name": "Error",
            "description": "analysis-failed",
            "date": current_date,
            "suggested_name": f"Error_{os.path.splitext(os.path.basename(req.file_path))[0]}",
            "suggested_folder": "Error",
            "reasoning": f"Gemini API Error: {str(e)}"
        }

@app.post("/api/execute")
async def execute_rearrangement(req: ExecuteRequest):
    """
    Copies the selected files to the new folder structure with their suggested names.
    Leaves original files intact to prevent accidental deletion.
    """
    base_folder = req.base_folder
    if not os.path.exists(base_folder):
        raise HTTPException(status_code=404, detail="Base directory does not exist.")

    results = []
    
    for item in req.items:
        original = item.original_path
        if not os.path.exists(original):
            results.append({
                "original_path": original,
                "status": "error",
                "message": "Original file no longer exists."
            })
            continue

        # Extract file extension from the original file
        _, ext = os.path.splitext(original.lower())
        
        # Build destination directory and file paths
        dest_dir = os.path.join(base_folder, item.suggested_folder)
        
        # Ensure name doesn't double-include extension
        cleaned_suggested_name = item.suggested_name
        if cleaned_suggested_name.lower().endswith(ext):
            # Strip extension from suggested name if it's there
            cleaned_suggested_name = cleaned_suggested_name[:-len(ext)]
            
        # Standardize suggested name by stripping illegal characters
        # (e.g., \ / : * ? " < > |)
        cleaned_suggested_name = "".join(c for c in cleaned_suggested_name if c not in '\\/:*?"<>|').strip()
        
        dest_filename = f"{cleaned_suggested_name}{ext}"
        dest_path = os.path.join(dest_dir, dest_filename)

        try:
            # Create target folder structure
            os.makedirs(dest_dir, exist_ok=True)

            # Prevent overwriting existing files by appending a counter if target file exists
            counter = 1
            while os.path.exists(dest_path):
                dest_filename = f"{cleaned_suggested_name}_{counter}{ext}"
                dest_path = os.path.join(dest_dir, dest_filename)
                counter += 1

            # Copy file (keeps metadata and keeps the original file in its parent folder)
            shutil.copy2(original, dest_path)
            
            results.append({
                "original_path": original,
                "new_path": dest_path,
                "new_filename": dest_filename,
                "status": "success",
                "message": f"Successfully copied to {os.path.relpath(dest_path, base_folder)}"
            })
        except Exception as e:
            results.append({
                "original_path": original,
                "status": "error",
                "message": f"File copy failed: {str(e)}"
            })

    return {"results": results}

@app.post("/api/delete-originals")
async def delete_originals(req: DeleteRequest):
    """
    Deletes the original files specified in the request.
    This is executed only when the user explicitly instructs it via the cleanup view.
    """
    deleted = []
    errors = []
    
    for path in req.file_paths:
        if not os.path.exists(path):
            errors.append({"path": path, "message": "File does not exist."})
            continue
            
        try:
            os.remove(path)
            deleted.append(path)
        except Exception as e:
            errors.append({"path": path, "message": str(e)})
            
    return {
        "deleted": deleted,
        "errors": errors
    }

# Mount static frontend directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory '{FRONTEND_DIR}' not found. Serving API routes only.")

# Add route for direct root fallback if index.html is needed explicitly
@app.get("/")
async def get_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Welcome to Document Organizer API. Frontend files missing."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
