use std::env;

use diesel::pg::PgConnection;
use diesel::r2d2::{ConnectionManager, Pool};

pub type PgPool = Pool<ConnectionManager<PgConnection>>;

pub fn connect() -> PgPool {
    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let manager = ConnectionManager::<PgConnection>::new(database_url);
    Pool::builder()
        .build(manager)
        .expect("Error getting connection pool")
}
