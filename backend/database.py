import os
import urllib.parse
import pymysql
import psycopg2
import psycopg2.extras
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MYSQL_HOST = os.getenv("MYSQL_HOST", "20.195.112.209")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 6033))
MYSQL_USER = os.getenv("MYSQL_USER", "alpha_readonly")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "Ym94rWsLLNcRWRsD")
MYSQL_DB = os.getenv("MYSQL_DB", "nafas_mydevice")

PG_HOST = os.getenv("PG_HOST", "4.144.141.244")
PG_PORT = int(os.getenv("PG_PORT", 5432))
PG_USER = os.getenv("PG_USER", "alpha_readonly")
PG_PASSWORD = os.getenv("PG_PASSWORD", "Ym94rWsLLNcRWRsD")
PG_DB = os.getenv("PG_DB", "neondb")
PG_SSLMODE = os.getenv("PG_SSLMODE", "disable")

# Tactical Sheet CRM (NeonDB Cloud Postgres)
TACTICAL_PG_URI = os.getenv("TACTICAL_PG_URI", "postgresql://neondb_owner:npg_VfYxuqoI9M2t@ep-misty-unit-b3sok8d2.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require")
TACTICAL_PG_HOST = os.getenv("TACTICAL_PG_HOST", "ep-misty-unit-b3sok8d2.c-4.ap-southeast-1.aws.neon.tech")
TACTICAL_PG_PORT = int(os.getenv("TACTICAL_PG_PORT", 5432))
TACTICAL_PG_USER = os.getenv("TACTICAL_PG_USER", "neondb_owner")
TACTICAL_PG_PASSWORD = os.getenv("TACTICAL_PG_PASSWORD", "npg_VfYxuqoI9M2t")
TACTICAL_PG_DB = os.getenv("TACTICAL_PG_DB", "neondb")
TACTICAL_PG_SSLMODE = os.getenv("TACTICAL_PG_SSLMODE", "require")

MONGO_HOST = os.getenv("MONGO_HOST", "20.24.141.186")
MONGO_PORT = int(os.getenv("MONGO_PORT", 27017))
MONGO_USER = os.getenv("MONGO_USER", "alpha_readonly")
MONGO_PASSWORD = os.getenv("MONGO_PASSWORD", "Ym94rWsLLNcRWRsD")
MONGO_AUTH_DB = os.getenv("MONGO_AUTH_DB", "admin")
MONGO_DB = os.getenv("MONGO_DB", "billing")

def get_mysql_connection():
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=30,
        read_timeout=120,
        write_timeout=30
    )

def get_pg_connection():
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        dbname=PG_DB,
        sslmode=PG_SSLMODE,
        connect_timeout=30,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5
    )

def get_tactical_pg_connection():
    if TACTICAL_PG_URI:
        return psycopg2.connect(
            TACTICAL_PG_URI,
            connect_timeout=30,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5
        )
    return psycopg2.connect(
        host=TACTICAL_PG_HOST,
        port=TACTICAL_PG_PORT,
        user=TACTICAL_PG_USER,
        password=TACTICAL_PG_PASSWORD,
        dbname=TACTICAL_PG_DB,
        sslmode=TACTICAL_PG_SSLMODE,
        connect_timeout=30,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5
    )

def get_mongo_client():
    uri = f"mongodb://{urllib.parse.quote_plus(MONGO_USER)}:{urllib.parse.quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}/?authSource={MONGO_AUTH_DB}&serverSelectionTimeoutMS=20000&connectTimeoutMS=20000"
    return MongoClient(uri)

def get_mongo_db(db_name: str = None):
    client = get_mongo_client()
    return client[db_name or MONGO_DB]
