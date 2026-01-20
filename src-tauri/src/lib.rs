mod commands;
mod db;
mod error;
mod media;
mod session;
mod session_store;

use commands::auth::AgentState;
use db::DbState;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize keyring for persistent credential storage on Linux
    session::init_keyring();

    // Initialize agent state
    let agent_state: AgentState = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(agent_state)
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            commands::auth::login,
            commands::auth::logout,
            commands::auth::get_session,
            commands::auth::resume_session,
            // Post actions
            commands::actions::like_post,
            commands::actions::unlike_post,
            commands::actions::repost_post,
            commands::actions::unrepost_post,
            commands::actions::create_post,
            commands::actions::follow_user,
            commands::actions::unfollow_user,
            commands::actions::mute_actor,
            commands::actions::unmute_actor,
            commands::actions::block_actor,
            commands::actions::unblock_actor,
            commands::actions::save_post_draft,
            commands::actions::get_post_draft,
            commands::actions::clear_post_draft,
            // Timeline commands
            commands::timeline::get_timeline,
            commands::timeline::get_profile,
            commands::timeline::get_followers,
            commands::timeline::get_follows,
            commands::timeline::get_post_thread,
            commands::timeline::get_author_feed,
            // Feeds commands
            commands::feeds::get_suggested_feeds,
            commands::feeds::get_feed,
            // Lists commands
            commands::lists::get_actor_lists,
            commands::lists::get_list,
            commands::lists::get_subject_list_memberships,
            commands::lists::create_list,
            commands::lists::update_list,
            commands::lists::delete_list,
            commands::lists::add_list_member,
            commands::lists::remove_list_member,
            commands::lists::get_list_feed,
            // Chat commands
            commands::chat::get_conversations,
            commands::chat::get_messages,
            commands::chat::send_message,
            commands::chat::get_convo_for_members,
            commands::chat::get_convo,
            commands::chat::update_read,
            commands::chat::get_chat_unread_count,
            // Notification commands
            commands::notifications::get_notifications,
            commands::notifications::get_unread_count,
            commands::notifications::mark_notifications_read,
            // Search commands
            commands::search::search,
            commands::search::search_actors,
            commands::search::search_posts,
            // Window commands
            commands::window::minimize_window,
            commands::window::maximize_window,
            commands::window::close_window,
            commands::window::is_maximized,
            // System
            commands::system::get_system_theme,
            // Media
            commands::media::save_image,
            commands::media::save_video,
            commands::media::download_and_save_gif,
            commands::media::get_cached_image,
        ])
        .setup(|app| {
            let db_state = tauri::async_runtime::block_on(db::init_db_state(&app.handle()))
                .map_err(|e| std::io::Error::other(e.to_string()))?;
            app.manage(db_state.clone());

            let handle = app.handle().clone();
            let agent_state = app.state::<AgentState>();
            let agent_state_clone = (*agent_state).clone();
            let retry_agent_state = agent_state_clone.clone();
            let retry_db_state = app.state::<DbState>().inner().clone();
            let retry_handle = handle.clone();

            // Debug-only: print cache directory for media inspection
            #[cfg(debug_assertions)]
            {
                match app.path().app_cache_dir() {
                    Ok(path) => println!("[debug] app cache dir: {}", path.display()),
                    Err(err) => println!("[debug] failed to resolve app cache dir: {err}"),
                }
            }

            // Background polling task (every 3 minutes)
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(180));
                loop {
                    interval.tick().await;

                    // Skip if no session
                    let guard = agent_state_clone.lock().await;
                    if let Some(agent) = guard.as_ref() {
                        // Check unread count
                        let result = agent
                            .api
                            .app
                            .bsky
                            .notification
                            .get_unread_count(
                                bsky_sdk::api::app::bsky::notification::get_unread_count::ParametersData {
                                    seen_at: None,
                                    priority: None,
                                }
                                .into(),
                            )
                            .await;

                        if let Ok(response) = result {
                            let count = response.data.count as u32;
                            // Emit event to frontend
                            let _ = handle.emit("unread-count", count);

                            // Update tray icon title/tooltip (if tray exists)
                            // Note: In a real app we'd construct the tray properly.
                            // For this MVP we assume the default tray or just rely on the event.
                        }
                    }
                }
            });

            // Retry queued post submissions in the background.
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(20));
                loop {
                    interval.tick().await;
                    if let Err(err) = commands::actions::retry_queued_posts(
                        retry_handle.clone(),
                        retry_agent_state.clone(),
                        retry_db_state.clone(),
                    )
                    .await
                    {
                        eprintln!("[retry-queue] cycle failed: {err}");
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
