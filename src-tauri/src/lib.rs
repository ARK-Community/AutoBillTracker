// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Open URLs/files with the OS default handlers
        .plugin(tauri_plugin_opener::init())
        // Key-value store persisted to a JSON file
        .plugin(tauri_plugin_store::Builder::default().build())
        // System notifications (for due bill alerts)
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
