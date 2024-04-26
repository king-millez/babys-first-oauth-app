FROM python:3.10

WORKDIR /app
COPY . .
RUN sh -c "curl -sSL https://install.python-poetry.org | python3 -"
RUN /root/.local/bin/poetry install