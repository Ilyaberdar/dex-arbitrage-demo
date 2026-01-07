use serde::Deserialize;
use std::fs;


#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub cache: CacheSettings,
    #[serde(default)]
    pub test: bool,
}

pub fn read_config_or_default() -> Config {

    let mut config = Config::default();
    // Reload config file
    match fs::read_to_string("config.json") {
        Ok(content) => {
            match serde_json::from_str::<Config>(&content) {
                Ok(cfg) => {
                    log::info!("Config reloaded: {:?}", cfg);
                    config = cfg;
                },
                Err(e) => log::error!("Failed to parse config: {}", e),
            }
        },
        Err(e) => log::error!("Failed to read config file: {}", e),
    }

    return config;
}

impl Default for Config {
    fn default() -> Self {
        Config {
            cache: CacheSettings::default(),
            test: false
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CacheSettings {
    #[serde(default)]
    pub dir: String,
    #[serde(default)]
    pub save_every: String,
}

impl Default for CacheSettings {
    fn default() -> Self {
        CacheSettings {
            dir: "cache".to_string(),
            save_every: "1h".to_string(),
        }
    }
}
