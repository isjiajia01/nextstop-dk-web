# Route shapes from GTFS

The optional generator produces `public/generated/route-5c.geojson` from Rejseplan's static GTFS data. The output is ignored by Git. The app currently uses its synthetic `ROUTE_5C` fixture; `src/data/routeShape.ts` provides a loader for a future consumer, but does not change the map.

## Obtain the feed and generate

1. Request access through the [Rejseplan Labs contact form](https://labs.rejseplanen.dk/hc/requests/new?ticket_form_id=17536468593565). Once approved, sign in to Labs and download the GTFS Schedule/Static ZIP from the service made available to your account. The [access instructions](https://labs.rejseplan.dk/hc/da/articles/21553113674909) describe this process; the [GTFS description](https://labs.rejseplan.dk/hc/da/articles/21639730766877) says the feed is updated approximately every 14 days.
2. Keep the ZIP outside the repository, for example at `~/.cache/agent-runtime/gtfs/raw/GTFS.zip`.
3. Run:

   ```sh
   npm ci
   npm run shapes
   # Or provide a different location:
   GTFS_ZIP=/path/to/GTFS.zip npm run shapes
   npm run dev
   npm run build
   ```

`npm run dev` and `npm run build` invoke the generator automatically. If the ZIP is absent, generation prints a warning and succeeds, so builds without GTFS (including CI) continue to use the fixture. A present but invalid feed fails generation. The script requires `unzip` on the command line and streams the archive entries, including `stop_times.txt`.

The generator selects the most common shape among all trips for each direction of routes named 5C, breaking ties by shape ID. It uses the first trip with that shape for ordered stops, without filtering the calendar, so the selected service may not be current. It validates stop order against the shape and compares shape length with the path between consecutive stops, then simplifies the shape at a 4 m tolerance and rounds coordinates to five decimal places. Point features carry `directionId` to associate them with their line; they retain GTFS stop sequence numbers. Update the feed and regenerate to refresh the file.

## Data use and attribution

Rejseplan's [Labs guidelines](https://labs.rejseplan.dk/hc/da/articles/21553298043165) say its data is provided under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), and that static data may be used commercially. CC BY 4.0 requires appropriate credit, a link to the license, and an indication of changes when sharing adapted data; retain any applicable attribution notices supplied with the data. For this generated file, credit Rejseplan as the data source, link the license, and disclose that route geometry was simplified and coordinates rounded. The guidelines also ask users not to change data so it differs from the original or present it in a misleading way. Because this generator simplifies geometry, confirm that the intended presentation and redistribution comply with the guidelines; contact Rejseplan if in doubt. Separate rules apply to Rejseplan's API and to third-party data that Rejseplan cannot redistribute. The eventual UI that displays these shapes must provide the appropriate attribution.
