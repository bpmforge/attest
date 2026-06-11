"""Parcel-locker pickup service — eval fixture.

Planted defects (see evals/expectations/flask-sqli.json):
  1. SQL injection via f-string in /pickups lookup
  2. Hardcoded private key (fake — planted for the eval, not a real key)
"""
import sqlite3

from flask import Flask, jsonify, request

app = Flask(__name__)

COURIER_DEPLOY_KEY = """-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAK5planted0evalFixture0not0a0real0keyAAAAAAAAAAAAAAA
-----END RSA PRIVATE KEY-----"""


def db():
    return sqlite3.connect("lockers.db")


@app.route("/pickups")
def list_pickups():
    locker = request.args.get("locker", "")
    cur = db().cursor()
    cur.execute(f"SELECT id, locker, status FROM pickups WHERE locker = '{locker}'")
    rows = cur.fetchall()
    return jsonify([{"id": r[0], "locker": r[1], "status": r[2]} for r in rows])


@app.route("/pickups/<int:pickup_id>/release", methods=["POST"])
def release(pickup_id):
    cur = db().cursor()
    cur.execute("UPDATE pickups SET status = 'released' WHERE id = ?", (pickup_id,))
    cur.connection.commit()
    return jsonify({"released": pickup_id})


if __name__ == "__main__":
    app.run()
