# D&D Table Live

The DM speaks into one microphone. A pause publishes the transcript to the room, and players see the update and two suggestions for their selected character. Suggestions match the latest scene to common situations and favor the abilities you enter. The host can pause, type an update, or correct the latest transcript.

## Run on your own Wi-Fi

1. Extract this ZIP on the host laptop. Have Node.js 22.13 or newer and Chrome installed. Open a terminal in the extracted folder and run `npm run dev`. There are no packages to install.
2. Set the clip-on receiver as the laptop's input in sound settings. In Chrome on that laptop, open `http://localhost:4173`, select **Start a table**, then **Start listening**. Allow the microphone and keep the host tab open. With the table's agreement, say a test line into the mic and check that the words appear under **Current scene**.
3. On the same Wi-Fi, send players the **Copy player link** URL. The link uses the laptop's local address. If the laptop has multiple connections, use the matching **Players** address printed in the terminal and keep the `?room=…` part of the link. Players select their characters on their phones.
4. Open **Character sheets and abilities** to enter what the five characters can actually use. Use `combat | Sacred Flame — action, one visible creature in range, no spell slot.` as a format example. The starter roster and recap reflect the Onyx Jewel campaign.
5. Use **End room and delete session** when finished. Rooms stop accepting requests eight hours after creation. By default, the local runner keeps transcript text in memory and clears it when it stops.

The host uses the browser's speech-recognition service. Internet access and microphone permission are needed. The app shares transcript text with the room and does not retain an audio file. Player phones need no microphone permission. If phones cannot load the page, check that their Wi-Fi allows device-to-device connections and that the host laptop's firewall allows the local server on the private network.
