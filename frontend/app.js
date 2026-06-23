// State Management
const state = {
    settings: {
        apiKey: '',
        namingTemplate: '{Category}_{Client}_{Description}_{Date}',
        folderStrategy: 'category'
    },
    files: [], // Array of scanned/classified files
    executionResults: [], // Results from copy operations
    cleanupItems: [], // Successfully copied files ready for cleanup
    activeTab: 'tab-scan',
    apiBase: '' // Local root relative path
};

// DOM Elements
const elements = {
    apiKeyInput: document.getElementById('api-key-input'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    namingTemplateInput: document.getElementById('naming-template-input'),
    folderStrategySelect: document.getElementById('folder-strategy-select'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    toggleSettingsBtn: document.getElementById('toggle-settings-btn'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    
    folderPathInput: document.getElementById('folder-path-input'),
    browseBtn: document.getElementById('browse-btn'),
    scanBtn: document.getElementById('scan-btn'),
    
    scanStats: document.getElementById('scan-stats'),
    statTotal: document.getElementById('stat-total'),
    statPending: document.getElementById('stat-pending'),
    statProcessed: document.getElementById('stat-processed'),
    
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    classificationToolbar: document.getElementById('classification-toolbar'),
    executionToolbar: document.getElementById('execution-toolbar'),
    cleanupToolbar: document.getElementById('cleanup-toolbar'),
    
    classifyBtn: document.getElementById('classify-btn'),
    executeBtn: document.getElementById('execute-btn'),
    cleanupBtn: document.getElementById('cleanup-btn'),
    selectedCountLabel: document.getElementById('selected-count-label'),
    
    masterSelectScan: document.getElementById('master-select-scan'),
    masterSelectExec: document.getElementById('master-select-exec'),
    masterSelectCleanup: document.getElementById('master-select-cleanup'),
    
    filesTableBody: document.getElementById('files-table-body'),
    executionTableBody: document.getElementById('execution-table-body'),
    cleanupTableBody: document.getElementById('cleanup-table-body'),
    
    consoleLogs: document.getElementById('console-logs'),
    clearConsoleBtn: document.getElementById('clear-console-btn'),
    connectionStatus: document.getElementById('connection-status'),
    
    toast: document.getElementById('toast'),
    toastIcon: document.getElementById('toast-icon'),
    toastMessage: document.getElementById('toast-message'),
    
    confirmModal: document.getElementById('confirm-modal'),
    deleteCountText: document.getElementById('delete-count-text'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn')
};

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    bindEvents();
    checkBackendConnection();
    logConsole('DocuFlow frontend loaded. Configuring modules...');
});

// Load Settings from LocalStorage
function loadSettings() {
    const savedApiKey = localStorage.getItem('df_api_key');
    const savedTemplate = localStorage.getItem('df_naming_template');
    const savedStrategy = localStorage.getItem('df_folder_strategy');

    if (savedApiKey) state.settings.apiKey = savedApiKey;
    if (savedTemplate) state.settings.namingTemplate = savedTemplate;
    if (savedStrategy) state.settings.folderStrategy = savedStrategy;

    // Apply to UI
    elements.apiKeyInput.value = state.settings.apiKey;
    elements.namingTemplateInput.value = state.settings.namingTemplate;
    elements.folderStrategySelect.value = state.settings.folderStrategy;
    
    if (!state.settings.apiKey) {
        logConsole('Welcome to DocuFlow! Please configure your Gemini API Key in Settings.', 'warning');
        showToast('Please set your Gemini API Key first', 'warning');
        toggleSettings(true);
    }
}

// Bind User Interactions
function bindEvents() {
    // Settings panel toggle
    elements.toggleSettingsBtn.addEventListener('click', () => toggleSettings());
    elements.closeSettingsBtn.addEventListener('click', () => toggleSettings(false));
    
    // Toggle password visibility
    elements.toggleKeyVisibility.addEventListener('click', () => {
        const type = elements.apiKeyInput.type === 'password' ? 'text' : 'password';
        elements.apiKeyInput.type = type;
        const icon = elements.toggleKeyVisibility.querySelector('i');
        icon.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    // Save Settings
    elements.saveSettingsBtn.addEventListener('click', () => {
        state.settings.apiKey = elements.apiKeyInput.value.strip ? elements.apiKeyInput.value.strip() : elements.apiKeyInput.value.trim();
        state.settings.namingTemplate = elements.namingTemplateInput.value;
        state.settings.folderStrategy = elements.folderStrategySelect.value;
        
        localStorage.setItem('df_api_key', state.settings.apiKey);
        localStorage.setItem('df_naming_template', state.settings.namingTemplate);
        localStorage.setItem('df_folder_strategy', state.settings.folderStrategy);
        
        showToast('Settings saved successfully', 'success');
        logConsole('Configuration updated and saved to local storage.');
        toggleSettings(false);
    });

    // Folder selection
    elements.browseBtn.addEventListener('click', browseFolder);
    elements.scanBtn.addEventListener('click', scanFolder);

    // Tab buttons
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });

    // Master selection checkboxes
    elements.masterSelectScan.addEventListener('change', (e) => {
        const checked = e.target.checked;
        state.files.forEach(f => f.checked = checked);
        updateFilesTable();
        updateToolbarStates();
    });

    elements.masterSelectExec.addEventListener('change', (e) => {
        const checked = e.target.checked;
        state.files.filter(f => f.status === 'done').forEach(f => f.execChecked = checked);
        updateExecutionTable();
        updateToolbarStates();
    });

    elements.masterSelectCleanup.addEventListener('change', (e) => {
        const checked = e.target.checked;
        state.cleanupItems.forEach(f => f.checked = checked);
        updateCleanupTable();
        updateToolbarStates();
    });

    // Action buttons
    elements.classifyBtn.addEventListener('click', classifySelected);
    elements.executeBtn.addEventListener('click', executeRearrangement);
    elements.cleanupBtn.addEventListener('click', openCleanupModal);

    // Console logging
    elements.clearConsoleBtn.addEventListener('click', () => {
        elements.consoleLogs.innerHTML = '<div class="log-line system">Console cleared.</div>';
    });

    // Modal cancellations
    elements.modalCloseBtn.addEventListener('click', () => toggleModal(false));
    elements.modalCancelBtn.addEventListener('click', () => toggleModal(false));
    elements.modalConfirmBtn.addEventListener('click', deleteOriginalFiles);
}

// Check if FastAPI is running
async function checkBackendConnection() {
    try {
        const response = await fetch(`${state.apiBase}/api/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: '' })
        });
        // We expect a 404 or 400 back since path is empty, but a response means connection works!
        setConnectionStatus(true);
    } catch (err) {
        setConnectionStatus(false);
        logConsole('Cannot reach backend server. Ensure FastAPI is running on http://127.0.0.1:8000', 'error');
    }
}

function setConnectionStatus(connected) {
    if (connected) {
        elements.connectionStatus.className = 'status-badge connected';
        elements.connectionStatus.querySelector('.status-text').textContent = 'Backend Connected';
    } else {
        elements.connectionStatus.className = 'status-badge disconnected';
        elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
        showToast('Backend connection offline', 'error');
    }
}

// Collapsible Settings
function toggleSettings(open = null) {
    if (open === null) {
        elements.settingsPanel.classList.toggle('hidden');
    } else if (open) {
        elements.settingsPanel.classList.remove('hidden');
    } else {
        elements.settingsPanel.classList.add('hidden');
    }
}

// Browse folder via native Tkinter selector
async function browseFolder() {
    logConsole('Opening folder selection dialog...');
    try {
        const response = await fetch(`${state.apiBase}/api/browse-folder`);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        if (data.folder_path) {
            elements.folderPathInput.value = data.folder_path;
            logConsole(`Selected folder: ${data.folder_path}`, 'success');
        } else {
            logConsole('Folder selection cancelled by user.', 'warning');
        }
    } catch (err) {
        logConsole(`Error: ${err.message}`, 'error');
        showToast('Browse failed. Enter path manually.', 'warning');
    }
}

// Scan Folder
async function scanFolder() {
    const folderPath = elements.folderPathInput.value.trim();
    if (!folderPath) {
        showToast('Please select or enter a folder path', 'warning');
        return;
    }

    logConsole(`Scanning directory: ${folderPath}...`);
    elements.scanBtn.disabled = true;
    elements.scanBtn.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Scanning...';

    try {
        const response = await fetch(`${state.apiBase}/api/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: folderPath })
        });

        if (!response.ok) {
            const errDetail = await response.json();
            throw new Error(errDetail.detail || 'Directory scan failed');
        }

        const data = await response.json();
        
        // Transform backend response into app state model
        state.files = data.files.map(f => ({
            ...f,
            checked: true, // Default to checked
            execChecked: true,
            status: 'pending', // pending, reading, classifying, done, error
            category: 'Other',
            client_name: 'General',
            description: '',
            date: '',
            suggested_name: f.filename,
            suggested_folder: '',
            reasoning: '',
            error_message: ''
        }));

        logConsole(`Scan complete. Found ${state.files.length} supported documents.`, 'success');
        showToast(`Found ${state.files.length} documents`, 'success');
        
        // Show statistics
        elements.scanStats.classList.remove('hidden');
        updateStats();
        
        // Render files
        updateFilesTable();
        updateToolbarStates();
    } catch (err) {
        logConsole(`Scan failed: ${err.message}`, 'error');
        showToast(err.message, 'error');
    } finally {
        elements.scanBtn.disabled = false;
        elements.scanBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Scan Folder';
    }
}

// Classify Selected Documents using Gemini API
async function classifySelected() {
    if (!state.settings.apiKey) {
        showToast('Gemini API key is required. Check Settings.', 'warning');
        toggleSettings(true);
        return;
    }

    const selectedFiles = state.files.filter(f => f.checked && f.status !== 'done');
    if (selectedFiles.length === 0) {
        showToast('Select files that need classification', 'warning');
        return;
    }

    logConsole(`Starting classification of ${selectedFiles.length} file(s) with Gemini API...`);
    elements.classifyBtn.disabled = true;

    // Concurrent execution limit of 3 files at a time to prevent API congestion
    const limit = 3;
    let index = 0;

    async function runWorker() {
        while (index < selectedFiles.length) {
            const currentFile = selectedFiles[index++];
            await processSingleFile(currentFile);
        }
    }

    // Spawn workers
    const workers = [];
    for (let i = 0; i < Math.min(limit, selectedFiles.length); i++) {
        workers.push(runWorker());
    }

    await Promise.all(workers);

    logConsole('Batch document classification completed.', 'success');
    showToast('Classification complete', 'success');
    elements.classifyBtn.disabled = false;
    
    // Switch to rearrangement view automatically so they can see results
    setTimeout(() => {
        switchTab('tab-review');
    }, 1000);
}

// Process single file call
async function processSingleFile(file) {
    file.status = 'classifying';
    updateFilesTable();
    logConsole(`Analyzing contents of [${file.filename}]...`);

    try {
        const response = await fetch(`${state.apiBase}/api/classify-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_path: file.absolute_path,
                api_key: state.settings.apiKey,
                naming_template: state.settings.namingTemplate
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();
        
        file.category = data.category || 'Other';
        file.client_name = data.client_name || 'General';
        file.description = data.description || '';
        file.date = data.date || '';
        
        // Handle name suggest mapping
        file.suggested_name = data.suggested_name || file.filename;
        
        // Align folder suggestions with the selected strategy
        if (state.settings.folderStrategy === 'flat') {
            file.suggested_folder = '';
        } else if (state.settings.folderStrategy === 'client-category') {
            const clientFolder = sanitizeFolderName(file.client_name);
            const categoryFolder = sanitizeFolderName(file.category + 's');
            file.suggested_folder = `${clientFolder}/${categoryFolder}`;
        } else { // default 'category'
            file.suggested_folder = sanitizeFolderName(file.category + 's');
        }

        file.reasoning = data.reasoning || '';
        file.status = 'done';
        logConsole(`Successfully analyzed [${file.filename}]. Suggested Name: "${file.suggested_name}", Class: ${file.category}.`, 'success');
    } catch (err) {
        file.status = 'error';
        file.error_message = err.message;
        logConsole(`Failed to classify [${file.filename}]: ${err.message}`, 'error');
    } finally {
        updateFilesTable();
        updateStats();
        updateToolbarStates();
    }
}

// Perform copy-rename execution
async function executeRearrangement() {
    const selectedFiles = state.files.filter(f => f.status === 'done' && f.execChecked);
    const baseFolder = elements.folderPathInput.value.trim();

    if (selectedFiles.length === 0) {
        showToast('Select files to rearrange', 'warning');
        return;
    }

    logConsole(`Executing copy/rename operations for ${selectedFiles.length} files...`);
    elements.executeBtn.disabled = true;
    elements.executeBtn.innerHTML = '<i class="fa-solid fa-spinner spinner"></i> Processing...';

    // Prepare request items
    const requestItems = selectedFiles.map(f => ({
        original_path: f.absolute_path,
        suggested_name: f.suggested_name,
        suggested_folder: f.suggested_folder
    }));

    try {
        const response = await fetch(`${state.apiBase}/api/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: requestItems,
                base_folder: baseFolder
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        
        // Merge results and generate logs
        data.results.forEach(res => {
            const correspondingFile = state.files.find(f => f.absolute_path === res.original_path);
            if (correspondingFile) {
                correspondingFile.execStatus = res.status; // success, error
                correspondingFile.execMessage = res.message;
            }

            if (res.status === 'success') {
                logConsole(`Copied: ${osBasename(res.original_path)} -> ${res.new_filename}`, 'success');
                
                // Add to cleanup registry
                if (!state.cleanupItems.some(i => i.original_path === res.original_path)) {
                    state.cleanupItems.push({
                        original_path: res.original_path,
                        new_path: res.new_path,
                        checked: true,
                        status: 'success'
                    });
                }
            } else {
                logConsole(`Failed to copy ${osBasename(res.original_path)}: ${res.message}`, 'error');
            }
        });

        showToast(`Execution finished. ${data.results.filter(r=>r.status==='success').length} successful.`, 'success');
        updateExecutionTable();
        updateCleanupTable();
        updateToolbarStates();

        // Switch to Clean Up automatically
        setTimeout(() => {
            switchTab('tab-cleanup');
        }, 1200);

    } catch (err) {
        logConsole(`Execution failed: ${err.message}`, 'error');
        showToast(err.message, 'error');
    } finally {
        elements.executeBtn.disabled = false;
        elements.executeBtn.innerHTML = '<i class="fa-solid fa-play"></i> Run Move/Rename Execution';
    }
}

// Cleanup operations
function openCleanupModal() {
    const itemsToDelete = state.cleanupItems.filter(i => i.checked && i.status === 'success');
    if (itemsToDelete.length === 0) {
        showToast('Select files to delete', 'warning');
        return;
    }

    elements.deleteCountText.textContent = itemsToDelete.length;
    toggleModal(true);
}

async function deleteOriginalFiles() {
    toggleModal(false);
    const itemsToDelete = state.cleanupItems.filter(i => i.checked && i.status === 'success');
    logConsole(`Deleting ${itemsToDelete.length} original files...`);
    elements.cleanupBtn.disabled = true;

    try {
        const filePaths = itemsToDelete.map(i => i.original_path);
        const response = await fetch(`${state.apiBase}/api/delete-originals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_paths: filePaths })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        
        // Handle deletion updates
        data.deleted.forEach(path => {
            const item = state.cleanupItems.find(i => i.original_path === path);
            if (item) {
                item.status = 'deleted';
            }
            logConsole(`Deleted source file: ${osBasename(path)}`, 'success');
        });

        data.errors.forEach(err => {
            const item = state.cleanupItems.find(i => i.original_path === err.path);
            if (item) {
                item.status = 'error';
                item.errorMessage = err.message;
            }
            logConsole(`Error deleting original [${osBasename(err.path)}]: ${err.message}`, 'error');
        });

        showToast(`Cleaned up ${data.deleted.length} source files`, 'success');
        updateCleanupTable();
        updateToolbarStates();

    } catch (err) {
        logConsole(`Delete cleanup failed: ${err.message}`, 'error');
        showToast(err.message, 'error');
    } finally {
        elements.cleanupBtn.disabled = false;
    }
}

// View Controller (Tabs)
function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Toggle active buttons
    elements.tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Toggle active panels
    elements.tabContents.forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });

    // Update headers action panels
    elements.classificationToolbar.classList.toggle('hidden', tabId !== 'tab-scan');
    elements.executionToolbar.classList.toggle('hidden', tabId !== 'tab-review');
    elements.cleanupToolbar.classList.toggle('hidden', tabId !== 'tab-cleanup');

    // Trigger grid updates
    if (tabId === 'tab-scan') {
        updateFilesTable();
    } else if (tabId === 'tab-review') {
        updateExecutionTable();
    } else if (tabId === 'tab-cleanup') {
        updateCleanupTable();
    }
    
    updateToolbarStates();
}

// Table Renders
function updateFilesTable() {
    if (state.files.length === 0) {
        elements.filesTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No folder selected. Select a directory and scan for documents to begin.</p>
                </td>
            </tr>`;
        return;
    }

    elements.filesTableBody.innerHTML = '';
    
    state.files.forEach((file, index) => {
        const row = document.createElement('tr');
        
        // Icon mapping
        let fileIconClass = 'fa-file-lines';
        let typeClass = 'other';
        const ext = file.extension.toLowerCase();
        if (ext === '.pdf') { fileIconClass = 'fa-file-pdf'; typeClass = 'pdf'; }
        else if (ext === '.docx' || ext === '.doc') { fileIconClass = 'fa-file-word'; typeClass = 'word'; }
        else if (ext === '.pptx' || ext === '.ppt') { fileIconClass = 'fa-file-powerpoint'; typeClass = 'ppt'; }
        else if (ext === '.xlsx' || ext === '.xls') { fileIconClass = 'fa-file-excel'; typeClass = 'excel'; }

        // Category formatting
        let catClass = 'other';
        if (file.category === 'Customer Proposal') catClass = 'proposal';
        else if (file.category === 'Customer Presentation') catClass = 'presentation-customer';
        else if (file.category === 'Internal Presentation') catClass = 'presentation-internal';
        else if (file.category === 'Knowledge Artifact') catClass = 'knowledge';

        // Checkbox element
        const checkedAttr = file.checked ? 'checked' : '';

        // Status rendering
        let statusHtml = '';
        if (file.status === 'pending') {
            statusHtml = `<div class="status-cell pending"><span class="status-indicator"></span>Ready</div>`;
        } else if (file.status === 'classifying') {
            statusHtml = `<div class="status-cell scanning"><i class="fa-solid fa-circle-notch spinner"></i>Classifying</div>`;
        } else if (file.status === 'done') {
            statusHtml = `<div class="status-cell done"><span class="status-indicator"></span>Completed</div>`;
        } else if (file.status === 'error') {
            statusHtml = `<div class="status-cell error" title="${file.error_message}"><span class="status-indicator"></span>Error</div>`;
        }

        row.innerHTML = `
            <td>
                <input type="checkbox" data-index="${index}" class="scan-select-check" ${checkedAttr}>
            </td>
            <td>
                <div class="file-info">
                    <div class="file-icon ${typeClass}"><i class="fa-solid ${fileIconClass}"></i></div>
                    <div class="file-name-meta">
                        <span class="file-original-name" title="${file.filename}">${file.filename}</span>
                        <span class="file-original-path" title="${file.absolute_path}">${file.relative_path}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="category-badge ${catClass}">${file.category}</span>
            </td>
            <td>
                <input type="text" data-index="${index}" data-field="suggested_name" class="editable-input text-field" value="${file.suggested_name}">
            </td>
            <td>
                <input type="text" data-index="${index}" data-field="suggested_folder" class="editable-input text-field" value="${file.suggested_folder}" placeholder="/">
            </td>
            <td>
                ${statusHtml}
            </td>
        `;

        elements.filesTableBody.appendChild(row);
    });

    // Rebind listeners on elements inside table
    document.querySelectorAll('.scan-select-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            state.files[idx].checked = e.target.checked;
            updateToolbarStates();
        });
    });

    document.querySelectorAll('.text-field').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            const field = e.target.getAttribute('data-field');
            state.files[idx][field] = e.target.value;
            logConsole(`Updated file [${state.files[idx].filename}] suggested ${field === 'suggested_name' ? 'name' : 'folder'} to "${e.target.value}".`);
        });
    });
}

function updateExecutionTable() {
    const readyFiles = state.files.filter(f => f.status === 'done');
    if (readyFiles.length === 0) {
        elements.executionTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="table-empty-state">
                    <i class="fa-solid fa-circle-nodes"></i>
                    <p>No classified files selected for execution. Go to "Scan & Classify" tab, analyze files, and check them.</p>
                </td>
            </tr>`;
        return;
    }

    elements.executionTableBody.innerHTML = '';
    
    readyFiles.forEach((file, index) => {
        const row = document.createElement('tr');
        const checkedAttr = file.execChecked ? 'checked' : '';
        const ext = file.extension;
        
        let targetRelativePath = file.suggested_folder 
            ? `${file.suggested_folder}/${file.suggested_name}${ext}`
            : `${file.suggested_name}${ext}`;
            
        let statusHtml = '<div class="status-cell pending"><span class="status-indicator"></span>Ready to create</div>';
        if (file.execStatus === 'success') {
            statusHtml = '<div class="status-cell done"><span class="status-indicator"></span>Copied</div>';
        } else if (file.execStatus === 'error') {
            statusHtml = `<div class="status-cell error" title="${file.execMessage}"><span class="status-indicator"></span>Failed</div>`;
        }

        row.innerHTML = `
            <td>
                <input type="checkbox" data-path="${file.absolute_path}" class="exec-select-check" ${checkedAttr}>
            </td>
            <td>
                <div class="file-name-meta">
                    <span class="file-original-name">${file.filename}</span>
                    <span class="file-original-path">${file.relative_path}</span>
                </div>
            </td>
            <td class="file-original-path" style="font-size: 0.85rem; color: var(--accent);">
                ${targetRelativePath}
            </td>
            <td>
                ${statusHtml}
            </td>
        `;

        elements.executionTableBody.appendChild(row);
    });

    document.querySelectorAll('.exec-select-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const path = e.target.getAttribute('data-path');
            const targetFile = state.files.find(f => f.absolute_path === path);
            if (targetFile) {
                targetFile.execChecked = e.target.checked;
            }
            updateToolbarStates();
        });
    });
}

function updateCleanupTable() {
    if (state.cleanupItems.length === 0) {
        elements.cleanupTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="table-empty-state">
                    <i class="fa-solid fa-shield-halved"></i>
                    <p>No files have been rearranged in this session yet. Originals will appear here after execution.</p>
                </td>
            </tr>`;
        return;
    }

    elements.cleanupTableBody.innerHTML = '';
    const baseFolder = elements.folderPathInput.value.trim();

    state.cleanupItems.forEach((item, index) => {
        const row = document.createElement('tr');
        const checkedAttr = item.checked ? 'checked' : '';
        const isSuccess = item.status === 'success';
        const checkboxDisabled = !isSuccess ? 'disabled' : '';
        
        let statusHtml = '';
        if (item.status === 'success') {
            statusHtml = '<div class="status-cell pending"><span class="status-indicator"></span>Original Intact</div>';
        } else if (item.status === 'deleted') {
            statusHtml = '<div class="status-cell done"><span class="status-indicator"></span>Source Deleted</div>';
        } else if (item.status === 'error') {
            statusHtml = `<div class="status-cell error" title="${item.errorMessage}"><span class="status-indicator"></span>Delete Failed</div>`;
        }

        row.innerHTML = `
            <td>
                <input type="checkbox" data-index="${index}" class="cleanup-select-check" ${checkedAttr} ${checkboxDisabled}>
            </td>
            <td>
                <span class="file-original-path" style="font-size: 0.85rem;" title="${item.original_path}">
                    ${osRelative(item.original_path, baseFolder)}
                </span>
            </td>
            <td>
                <span class="file-original-path" style="font-size: 0.85rem; color: var(--success);" title="${item.new_path}">
                    ${osRelative(item.new_path, baseFolder)}
                </span>
            </td>
            <td>
                ${statusHtml}
            </td>
        `;

        elements.cleanupTableBody.appendChild(row);
    });

    document.querySelectorAll('.cleanup-select-check').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            state.cleanupItems[idx].checked = e.target.checked;
            updateToolbarStates();
        });
    });
}

// Stats & Actions Helpers
function updateStats() {
    const total = state.files.length;
    const processed = state.files.filter(f => f.status === 'done').length;
    const pending = total - processed;

    elements.statTotal.textContent = total;
    elements.statPending.textContent = pending;
    elements.statProcessed.textContent = processed;
}

function updateToolbarStates() {
    // Tab 1: Scan
    const checkedCount = state.files.filter(f => f.checked && f.status !== 'done').length;
    elements.selectedCountLabel.textContent = checkedCount;
    elements.classifyBtn.disabled = checkedCount === 0;
    
    // Master checkbox scan status
    const totalScanChecked = state.files.filter(f => f.checked).length;
    elements.masterSelectScan.checked = state.files.length > 0 && totalScanChecked === state.files.length;

    // Tab 2: Execution
    const readyToExec = state.files.filter(f => f.status === 'done' && f.execChecked).length;
    elements.executeBtn.disabled = readyToExec === 0;
    
    // Master checkbox exec status
    const totalExecReady = state.files.filter(f => f.status === 'done').length;
    const totalExecChecked = state.files.filter(f => f.status === 'done' && f.execChecked).length;
    elements.masterSelectExec.checked = totalExecReady > 0 && totalExecChecked === totalExecReady;

    // Tab 3: Cleanup
    const selectedForCleanup = state.cleanupItems.filter(i => i.checked && i.status === 'success').length;
    elements.cleanupBtn.disabled = selectedForCleanup === 0;
    
    // Master checkbox cleanup status
    const totalCleanupReady = state.cleanupItems.filter(i => i.status === 'success').length;
    const totalCleanupChecked = state.cleanupItems.filter(i => i.checked && i.status === 'success').length;
    elements.masterSelectCleanup.checked = totalCleanupReady > 0 && totalCleanupChecked === totalCleanupReady;
}

// Utility functions
function logConsole(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.textContent = `[${timestamp}] ${message}`;
    elements.consoleLogs.appendChild(logLine);
    
    // Keep scrolled to bottom
    elements.consoleLogs.scrollTop = elements.consoleLogs.scrollHeight;
}

function showToast(message, type = 'info') {
    elements.toastMessage.textContent = message;
    elements.toast.className = `toast-notification show ${type}`;
    
    // Icon configuration
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-circle-check';
    else if (type === 'error') iconClass = 'fa-circle-xmark';
    else if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    elements.toastIcon.className = `fa-solid ${iconClass}`;

    // Hide after 3.5s
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3500);
}

function toggleModal(show) {
    if (show) {
        elements.confirmModal.classList.add('show');
    } else {
        elements.confirmModal.classList.remove('show');
    }
}

// Basic utilities for string formatting & paths
function sanitizeFolderName(name) {
    // Strip illegal characters for folder naming
    return name.replace(/[\\/:*?"<>|]/g, '').trim();
}

function osBasename(path) {
    return path.split(/[\\/]/).pop();
}

function osRelative(absolutePath, basePath) {
    if (absolutePath.startsWith(basePath)) {
        let rel = absolutePath.substring(basePath.length);
        if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.substring(1);
        return rel;
    }
    return absolutePath;
}
