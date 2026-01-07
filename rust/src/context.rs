use std::sync::OnceLock;
use tokio::sync::Mutex;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::path::Path;

use crate::config;

#[derive(Debug)]
pub struct Context {
    pub config: config::Config,
    pub config_modification_count: usize, // it might be a miltiple file update events, so
    // it's relible way is to store modification count as the reference to config content version.
    // Any code which relay on the config must hold this count and ready to reload on it change.

}

impl Default for Context {
    fn default() -> Self {
        Context { 
            config: config::Config::default(),
            config_modification_count: 0,
        }
    }
}

impl Context {

    pub async fn initialize_with_watcher() -> RecommendedWatcher{
        // Initialize context.
        match CONTEXT.set(Mutex::new(Context::default())) {
            Err(_) => panic!(),
            _ => ()
        }

        if let Some(mx) = CONTEXT.get() {
            let mut context = mx.lock().await;
            context.config_modification_count = 1;
            context.config = config::read_config_or_default();
        }
        
        // Automatically select the best implementation for your platform.
        // You can also access each implementation directly e.g. INotifyWatcher.
        let mut watcher = RecommendedWatcher::new( move |res: std::result::Result<Event, notify::Error>| {
            match res {
                Ok(event) if event.kind.is_modify() => {
                    if let Some(mx) = CONTEXT.get() {
                        let mut context = mx.blocking_lock();
                        context.config_modification_count = context.config_modification_count + 1;
                        context.config = config::read_config_or_default();
                        log::info!("config.json, new modification count => {}", context.config_modification_count);
                    }
                },
                Ok(event) => log::info!("unhandled: {:?}", event),
                Err(e) => log::info!("watch error: {:?}", e),
            }
        }, Config::default()).unwrap();

        // Add a path to be watched. All files and directories at that path and
        // below will be monitored for changes.
        watcher.watch(Path::new("./config.json"), RecursiveMode::NonRecursive).unwrap();
        watcher
    }
}

pub static CONTEXT: OnceLock<Mutex<Context>> = OnceLock::new();