pub mod v2;
pub mod v3;

use crate::ArbitrageDirection;
use v2::simulate_v2;
use v3::simulate_v3;

pub async fn simulate_direction(
    dir: &ArbitrageDirection,
) -> Option<(String, String, f64, f64, f64)> {
    match dir.pool_type.as_str() {
        "V2" => simulate_v2(dir).await,
        "V3" => simulate_v3(dir).await,
        _ => {
            log::error!("Unknown pool_type: {}", dir.pool_type);
            None
        }
    }
}
