# MQTT Explorer (VS Code Extension)

Cette extension apporte une vue MQTT dans VS Code :

- connexion a un broker MQTT
- profils de connexion sauvegardables
- abonnement automatique a `#`
- filtre de topics
- navigation par arborescence de topics
- inspection du dernier message recu sur un topic
- panneau live pour suivre un topic en temps reel
- publication de messages

## Demarrage rapide

1. Ouvrir le dossier `vscode-mqtt-explorer` dans VS Code.
2. Lancer `npm install`.
3. Lancer `npm run compile`.
4. Appuyer sur `F5` pour lancer la Development Host.
5. Ouvrir la vue **MQTT Explorer** dans l'explorateur.
6. Executer la commande **MQTT Explorer: Connect**.

## Commandes

- `MQTT Explorer: Connect`
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

## Notes

- Protocoles supportes : `mqtt`, `mqtts`, `ws`, `wss`
- L'extension affiche le dernier payload vu pour chaque topic.
