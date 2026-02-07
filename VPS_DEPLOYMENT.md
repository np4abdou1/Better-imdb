# VPS Deployment Guide (All-in-One)

You have successfully chosen to host the **entire project** on a VPS. This solves all Vercel timeout issues and gives you full control.

## Prerequisites
1.  **A VPS Server:** (Ubuntu 22.04 LTS recommended)
    *   Hetzner Cloud (CPX11 ~€5/mo) or DigitalOcean (Droplet ~$6/mo).
    *   At least 2GB RAM (4GB recommended for build process).
2.  **Domain Name:** Point `your-domain.com` to the VPS IP address.

## Installation on VPS

1.  **Install Docker & Docker Compose**
    ```bash
    # Update system
    sudo apt update && sudo apt upgrade -y
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    ```

2.  **Clone Your Repo**
    ```bash
    git clone https://github.com/np4abdou1/Better-imdb.git
    cd Better-imdb
    ```

3.  **Setup Environment Variables**
    Create a `.env` file for production (use your real secrets):
    ```bash
    nano .env
    ```
    Paste your variables:
    ```dotenv
    MONGODB_URI="mongodb+srv://..."
    AUTH_SECRET="your-secret-key"
    AUTH_GITHUB_ID="Over23..."
    AUTH_GITHUB_SECRET="c893..."
    GITHUB_TOKEN="ghp_..."
    TMDB_API_KEY="d229..."
    NEXT_PUBLIC_APP_URL="https://your-domain.com"
    AUTH_URL="https://your-domain.com"
    ```

4.  **Run with Docker Compose**
    ```bash
    sudo docker compose up -d --build
    ```

## Setting up SSL (HTTPS) with Nginx Proxy Manager (Easiest Way)

Instead of manual Nginx config, run Nginx Proxy Manager in Docker alongside your app:

1.  Add this to your `docker-compose.yml`:
    ```yaml
      npm:
        image: 'jc21/nginx-proxy-manager:latest'
        restart: unless-stopped
        ports:
          - '80:80'
          - '81:81'
          - '443:443'
        volumes:
          - ./data:/data
          - ./letsencrypt:/etc/letsencrypt
    ```
2.  Run `docker compose up -d`.
3.  Go to `http://your-vps-ip:81`. Default login: `admin@example.com` / `changeme`.
4.  Add a **Proxy Host**:
    *   Domain: `your-domain.com`
    *   Forward Hostname: `web` (Internal Docker name)
    *   Port: `3000`
    *   **SSL Tab:** Request a new Let's Encrypt Certificate.

## Updating the App
When you push changes to GitHub:
```bash
git pull
sudo docker compose up -d --build
```
