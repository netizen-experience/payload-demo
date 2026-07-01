// Any setup scripts you might need go here

// Load .env for secrets, then override DATABASE_URL from test.env so
// integration tests run against an isolated test database
import dotenv from 'dotenv'
dotenv.config()
dotenv.config({ path: 'test.env', override: true })
