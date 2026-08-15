Sky Hopper — Minimal Flying Game Starter

This project has been pivoted into a tiny, self-contained flying game prototype in plain HTML/JavaScript (ES modules). It implements:

- Canvas-based rendering
- A bird avatar with gravity and flap physics
- A stamina meter that drains on flaps and recharges while gliding
- Endless obstacles and score tracking
- Keyboard and mouse input for quick testing

Files created:
- index.html — entry page
- styles.css — HUD and full-screen styling
- src/input.js — keyboard + pointer input helpers
- src/player.js — bird physics and drawing
- src/main.js — game loop, obstacle spawning, HUD, and win/lose logic

Run locally:
1) Start the included local server:

   python server.py

2) Open http://localhost:8000 in your browser.

Controls:
- Space / W / mouse click to flap

Extending ideas:
- Add multiple enemy types and collectible gems
- Add parallax backgrounds and animated clouds
- Improve collision/particle effects and audio
- Add start menu, pause screen, and score persistence

This is intentionally lightweight so it can be expanded into a larger sky runner with minimal friction.
