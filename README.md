# MQTT Explorer (VS Code Extension)

The live panel formats JSON payloads and follows your VS Code theme. Switching connections clears previous topics and live payloads. Publication validates topic names before sending (no `+` or `#` wildcards, no null characters, at most 65,535 UTF-8 bytes).


[![qgRBv44.md.png](https://iili.io/qgRBv44.md.png)](https://freeimage.host/i/qgRBv44)
[![qgRBkGf.md.png](https://iili.io/qgRBkGf.md.png)](https://freeimage.host/i/qgRBkGf)


This extension adds an MQTT view to VS Code:

- Connection to an MQTT broker
- Saveable connection profiles
- Automatic subscription to `#`
- Topic filtering
- Topic tree navigation
- Inspection of the last message received on a topic
- Live panel to follow a topic in real time
- Posting messages

## Quick Start

5. Open the **MQTT Explorer** view in the file explorer.

6. Run the **MQTT Explorer: Connect** command.

## Orders

- `MQTT Explorer: Connect`
- `MQTT Explorer: Open Connection Manager`
- `MQTT Explorer: Connect Profile`
- `MQTT Explorer: Save Connection Profile`
- `MQTT Explorer: Delete Connection Profile`
- `MQTT Explorer: Disconnect`
- `MQTT Explorer: Publish Message`
- `MQTT Explorer: Inspect Message`
- `MQTT Explorer: Copy Topic`
- `MQTT Explorer: Set Topic Filter`
- `MQTT Explorer: Clear Topic Filter`
- `MQTT Explorer: Open Live Topic`

##Notes

- Supported protocols: `mqtt`, `mqtts`, `ws`, `wss`
- The extension displays the last payload seen for each topic.

## 1.0.4

Version 1.0.4 improves reconnection, 
Preserves empty topic levels, and batches tree updates. 
Right-click a topic with a message and choose **Copy Topic as JSON** to copy its payload and metadata. 

## 1.0.5
- The live panel forms JSON payloads and uses the VS Code theme.
- Changing the connection erases the topics and messages from the previous connection.
- Publication topics are validated before sending (without `+` or `#` jokers, without zero character, maximum 65 535 bytes UTF-8).
.