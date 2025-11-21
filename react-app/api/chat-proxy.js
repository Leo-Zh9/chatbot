export default async function handler(req, res) {
  const backendUrl = 'http://44.200.240.201:8000/api/chat'

  try {
    const response = await fetch(backendUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    })

    res.setHeader('Content-Type', 'text/event-stream')

    if (!response.body) {
      res.status(502).json({ error: 'Backend did not return a body' })
      return
    }

    response.body.pipe(res)
  } catch (error) {
    console.error('Proxy failed:', error)
    res.status(500).json({ error: 'Proxy failed' })
  }
}

