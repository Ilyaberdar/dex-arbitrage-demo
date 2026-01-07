use wasm_bindgen::prelude::*;
use serde::{Serialize, Serializer};
use std::collections::HashMap;

#[derive(Default)]
pub struct PerfEntry {
    pub durations: Vec<f64>,
    pub curve: Option<Vec<f64>>,
}

impl PerfEntry {
    pub fn avg(&self) -> f64 {
        let sum: f64 = self.durations.iter().sum();
        sum / self.durations.len().max(1) as f64
    }

    pub fn last(&self) -> f64 {
        *self.durations.last().unwrap_or(&0.0)
    }
}

#[wasm_bindgen]
pub struct PerfMeter {
    entries: HashMap<String, PerfEntry>,
    start_times: HashMap<String, f64>,
}

#[wasm_bindgen]
impl PerfMeter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> PerfMeter {
        PerfMeter {
            entries: HashMap::new(),
            start_times: HashMap::new(),
        }
    }

    pub fn start(&mut self, label: &str) {
        let now = js_sys::Date::now();
        self.start_times.insert(label.to_string(), now);
    }

    pub fn stop(&mut self, label: &str) {
        let now = js_sys::Date::now();
        if let Some(start) = self.start_times.remove(label) {
            let duration = now - start;
            let entry = self.entries.entry(label.to_string()).or_default();
            entry.durations.push(duration);
        }
    }

    pub fn add_curve(&mut self, label: &str, values: js_sys::Array) {
        let curve = values.iter()
            .filter_map(|val| val.as_f64())
            .collect::<Vec<f64>>();

        let entry = self.entries.entry(label.to_string()).or_default();
        entry.curve = Some(curve);
    }

    pub fn export_json(&self) -> JsValue {
        let output: Vec<_> = self.entries.iter().map(|(label, entry)| {
            let mut out = serde_json::Map::new();
            out.insert("label".to_string(), serde_json::Value::String(label.clone()));
            out.insert("avg_ms".to_string(), serde_json::Value::from(entry.avg()));
            out.insert("last_ms".to_string(), serde_json::Value::from(entry.last()));

            if let Some(curve) = &entry.curve {
                let key = if label.contains("1Pool") {
                    "price_curve_sell"
                } else if label.contains("2Pool") {
                    "price_curve_buy"
                } else {
                    "price_curve"
                };
                out.insert(key.to_string(), serde_json::to_value(curve).unwrap());
            }

            serde_json::Value::Object(out)
        }).collect();

        JsValue::from_serde(&output).unwrap()
    }
}
