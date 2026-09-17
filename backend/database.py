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
        read_timeout=90,
        write_timeout=30
    )

def get_pg_connection():
    return psycopg2.connect(
        host=PG_HOST,
        port=PG_PORT,
        user=PG_USER,
        password=PG_PASSWORD,
        dbname=PG_DB,
        connect_timeout=30
    )

def get_mongo_client():
    uri = f"mongodb://{urllib.parse.quote_plus(MONGO_USER)}:{urllib.parse.quote_plus(MONGO_PASSWORD)}@{MONGO_HOST}:{MONGO_PORT}/?authSource={MONGO_AUTH_DB}&serverSelectionTimeoutMS=20000&connectTimeoutMS=20000"
    return MongoClient(uri)

def get_mongo_db(db_name: str = None):
    client = get_mongo_client()
    return client[db_name or MONGO_DB]
