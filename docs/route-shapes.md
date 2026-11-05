# Route shapes from GTFS

The optional generator produces `public/generated/route-5c.geojson` from Rejseplan's static GTFS data. The output is ignored by Git. When the file is available, the journey map draws the matching real 5C LineString and projects the synthetic bus progress onto it. If it is missing, invalid, or an SPA server returns `index.html` with status 200, the map keeps using the synthetic `ROUTE_5C` fixture.

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

`npm run dev` and `npm run build` invoke the generator automatically. If the ZIP is absent, generation prints a warning and succeeds, so builds without GTFS continue to use the fixture. CI downloads the approximately 53 MB public archive to `$RUNNER_TEMP` before the build; a failed download leaves the fixture fallback available. A present but invalid feed fails generation. The script requires `unzip` on the command line; ubuntu-latest provides it, and the script streams the archive entries, including `stop_times.txt`.

The generator selects the most common shape among all trips for each direction of routes named 5C, breaking ties by shape ID. It uses the first trip with that shape for ordered stops, without filtering the calendar, so the selected service may not be current. It validates stop order against the shape and compares shape length with the path between consecutive stops, then simplifies the shape at a 4 m tolerance and rounds coordinates to five decimal places. Point features carry `directionId` to associate them with their line; they retain GTFS stop sequence numbers. Update the feed and regenerate to refresh the file.

The map chooses a direction by matching the journey destination to the generated headsign (exact or contained text, after Danish text folding). When no headsign matches, it chooses the direction with the greatest number of journey stop names matching in order; ties use the generator's feature order. The route line uses cumulative geodesic length, and the bus marker uses the journey's time progress interpolated onto that line. Stop markers remain at the journey stop coordinates.

## Data use and attribution

Rejseplan's [Labs guidelines](https://labs.rejseplan.dk/hc/da/articles/21553298043165) say its data is provided under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/legalcode), and that static data may be used commercially. CC BY 4.0 requires appropriate credit, a link to the license, and an indication of changes when sharing adapted data; retain any applicable attribution notices supplied with the data. For this generated file, the map shows `Rutedata © Rejseplanen (Rejseplan Labs), CC BY 4.0, forenklet geometri` with a link to the [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/). This is visible only while generated route geometry is being used. The guidelines also ask users not to change data so it differs from the original or present it in a misleading way. The generator's simplification and coordinate rounding are disclosed in the UI and here. Separate rules apply to Rejseplan's API and to third-party data that Rejseplan cannot redistribute.
