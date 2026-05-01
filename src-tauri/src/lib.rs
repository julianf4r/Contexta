use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use futures_util::StreamExt;
use reqwest::Client;

#[derive(Serialize, Deserialize, Clone)]
struct Message {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct TranslationPayload {
    model: String,
    messages: Vec<Message>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<Value>,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    // message: Option<Message>,
    delta: Option<Delta>,
}

#[derive(Deserialize)]
struct Delta {
    content: Option<String>,
}

#[derive(Serialize, Clone)]
struct TranslationChunkEvent {
    request_id: String,
    chunk: String,
}

#[tauri::command]
async fn translate(
    app: AppHandle,
    api_address: String,
    api_key: String,
    payload: TranslationPayload,
    request_id: String,
) -> Result<String, String> {
    let client = Client::new();
    // Ensure URL doesn't have double slashes if api_address ends with /
    let base_url = api_address.trim_end_matches('/');
    let url = format!("{}/chat/completions", base_url);

    let mut request = client.post(&url).json(&payload);

    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let res = request
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    if !status.is_success() {
        let error_text = res.text().await.unwrap_or_else(|_| format!("HTTP {}", status));
        return Err(format!("HTTP {}: {}", status, error_text));
    }

    if !payload.stream {
        let text = res.text().await.map_err(|e| e.to_string())?;
        return Ok(text);
    }

    let mut stream = res.bytes_stream();
    let mut raw_stream_log = Vec::new();
    let mut pending_line = Vec::new();
    let mut is_done = false;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        raw_stream_log.extend_from_slice(&chunk);
        pending_line.extend_from_slice(&chunk);

        while let Some(newline_index) = pending_line.iter().position(|byte| *byte == b'\n') {
            let line_bytes: Vec<u8> = pending_line.drain(..=newline_index).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim_end_matches(['\r', '\n']).trim();
            if line.is_empty() { continue; }
            if line == "data: [DONE]" {
                is_done = true;
                break;
            }
            
            if let Some(data_str) = line.strip_prefix("data: ") {
                if let Ok(json) = serde_json::from_str::<OpenAIResponse>(data_str) {
                    if let Some(choice) = json.choices.get(0) {
                        if let Some(delta) = &choice.delta {
                            if let Some(content) = &delta.content {
                                let event = TranslationChunkEvent {
                                    request_id: request_id.clone(),
                                    chunk: content.clone(),
                                };
                                app.emit("translation-chunk", event).map_err(|e| e.to_string())?;
                            }
                        }
                    }
                }
            }
        }

        if is_done {
            break;
        }
    }

    Ok(String::from_utf8_lossy(&raw_stream_log).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![translate])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
