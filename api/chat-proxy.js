export default async function handler(req, res) {
  const backendUrl = "http://44.200.240.201:8000/api/chat";

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    // Required for streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    if (!response.body) {
      res.status(502).json({ error: "Backend returned no body" });
      return;
    }

    // Stream tokens from backend to client
    response.body.pipe(res);
  } catch (err) {
    console.error("Proxy failed:", err);
    res.status(500).json({ error: "Proxy failed" });
  }
}
