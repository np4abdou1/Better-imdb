export const BASE_URL = "https://topcinema.rip";

export const HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": BASE_URL,
};

export const AJAX_HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": BASE_URL,
    "User-Agent": HEADERS["User-Agent"],
};

export const REQUEST_TIMEOUT = 15000; // ms
export const RETRY_TOTAL = 3;
export const RETRY_BACKOFF = 500; // ms
export const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
