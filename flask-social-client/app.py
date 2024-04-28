from flask import Flask, redirect, render_template, request
from flask_social import env
from flask_social.burger_joint import burger_count_for_user
from flask_social.token import access_token_from_grant, user_access_token

app = Flask(__name__, static_url_path="", static_folder="static/")


@app.route("/")
def home_page():
    return render_template("index.html", user_id=env["USER_ID"])


@app.route("/burgers")
def burgers():
    token = user_access_token(
        env["USER_ID"], env["TOKEN_AES_KEY"], env["CLIENT_ID"], env["CLIENT_SECRET"]
    )

    return (
        render_template(
            "burgers.html",
            user_id=env["USER_ID"],
            linked=True,
            burger_count=burger_count_for_user(token, env["USER_ID"]),
        )
        if token
        else render_template(
            "burgers.html",
            user_id=env["USER_ID"],
            client_id=env["CLIENT_ID"],
            linked=False,
            burger_endpoint=env["BURGER_RESOURCES_BASE_URL"],
            redirect_uri=f'{env["SOCIAL_CLIENT_BASE_URL"]}{env["OAUTH_CALLBACK"]}',
        )
    )


@app.route(env["OAUTH_CALLBACK"])
def oauth_callback():
    error = request.args.get("error")
    if error:
        return f"Received error from Burger Resources: [{error}]", 400

    code = request.args.get("code")
    if not code:
        return "No authorisation code provided.", 400

    return (
        redirect("/burgers")
        if access_token_from_grant(
            code,
            env["USER_ID"],
            env["CLIENT_ID"],
            env["CLIENT_SECRET"],
            env["TOKEN_AES_KEY"],
        )
        else ("Failed to generate access token", 500)
    )


if __name__ == "__main__":
    # Please do not set debug=True in production
    app.run(host="0.0.0.0", port=5000, debug=True)
