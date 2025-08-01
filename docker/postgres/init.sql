-- Create additional databases if needed
-- CREATE DATABASE nestjs_api_test;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create indexes for better performance
-- These will be created by TypeORM migrations, but can be added here for reference