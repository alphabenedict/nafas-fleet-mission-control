import os
import pymysql
import psycopg2
import psycopg2.extras
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

def get_mysql_connection():
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=30,
        read_timeout=60,
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
