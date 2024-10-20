let width = window.innerWidth;
let height = window.innerHeight;
let scale = Math.min(width, height) / 2 - 10;

const COUNTRY_FILL = "#90EE9005";
const SPHERE_FILL = "rgba(0, 0, 0, 0.1)";
const COUNTRY_BORDER_STROKE = "#444444";
const canvas = d3.select("#globe")
    .attr("width", width)
    .attr("height", height);

const context = canvas.node().getContext("2d");

let projection = d3.geoOrthographic()
    .scale(scale)
    .translate([width / 2, height / 2]);

let path = d3.geoPath().projection(projection).context(context);

let world, auroraData;
let userLocation = null;

const colorScale = d3.scaleSequential(d3.interpolatePlasma)
    .domain([0, 100]);

function loadData() {
    Promise.all([
        d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
        d3.json("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json")
    ]).then(function ([worldData, aurora]) {
        world = worldData;
        auroraData = aurora;
        getUserLocation();
    });
}

function getUserLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(function (position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            userLocation = [longitude, latitude];
            projection.rotate([-longitude, -latitude]);
            render();
            drawColorbar();
            updateMetadata();
        }, function (error) {
            console.error("Error getting user location:", error);
            render();
            drawColorbar();
            updateMetadata();
        });
    } else {
        console.log("Geolocation is not available");
        render();
        drawColorbar();
        updateMetadata();
    }
}

function render() {
    context.clearRect(0, 0, width, height);

    // Draw the globe
    context.beginPath();
    path({ type: "Sphere" });
    context.fillStyle = SPHERE_FILL;
    context.fill();

    // Draw graticules
    const graticule = d3.geoGraticule()
        .stepMajor([90, 90])
        .stepMinor([45, 45]);

    context.beginPath();
    path(graticule());
    context.lineWidth = 0.5;
    context.strokeStyle = "rgba(255, 255, 255, 1)";
    context.stroke();

    // Draw aurora
    auroraData.coordinates.forEach(d => {
        const [x, y] = projection(d.slice(0, 2));
        if (x !== null && y !== null) {
            const [lon, lat] = d.slice(0, 2);
            const [cx, cy] = projection.invert([width / 2, height / 2]);
            const geoDistance = d3.geoDistance([lon, lat], [cx, cy]);
            if (d[2] > 0 && geoDistance < Math.PI / 2) {
                drawAuroraPoint(x, y, d[2]);
            }
        }
    });

    // Helper function to draw aurora points
    function drawAuroraPoint(x, y, intensity) {
        context.beginPath();
        context.arc(x, y, 8, 0, 2 * Math.PI);
        context.fillStyle = colorScale(intensity);
        context.globalAlpha = intensity / 100;
        context.fill();
    }

    context.globalAlpha = 1;

    // Draw countries
    context.beginPath();
    path(topojson.feature(world, world.objects.countries));
    context.fillStyle = COUNTRY_FILL;
    context.fill();

    // Draw country boundaries
    context.beginPath();
    path(topojson.mesh(world, world.objects.countries, (a, b) => a !== b));
    context.strokeStyle = COUNTRY_BORDER_STROKE;
    context.lineWidth = 0.5;
    context.stroke();

    // Draw coastlines
    context.beginPath();
    path(topojson.feature(world, world.objects.land));
    context.strokeStyle = "white";
    context.lineWidth = 0.5;
    context.stroke();

    // Draw user location if checkbox is checked
    if (document.getElementById('show-location').checked && userLocation) {
        const [x, y] = projection(userLocation);
        context.beginPath();
        context.arc(x, y, 5, 0, 2 * Math.PI);
        context.fillStyle = 'red';
        context.fill();
        context.strokeStyle = 'white';
        context.lineWidth = 2;
        context.stroke();
    }
}

function drawColorbar() {
    const colorbarCanvas = d3.select("#colorbar")
        .attr("width", 80)
        .attr("height", 200);
    const colorbarContext = colorbarCanvas.node().getContext("2d");
    const gradient = colorbarContext.createLinearGradient(0, 200, 0, 0);

    for (let i = 0; i <= 1; i += 0.01) {
        gradient.addColorStop(i, colorScale(i * 100));
    }

    colorbarContext.fillStyle = gradient;
    colorbarContext.fillRect(0, 0, 20, 200);

    // Add labels
    colorbarContext.fillStyle = "white";
    colorbarContext.font = "12px Arial";
    colorbarContext.textAlign = "left";
    colorbarContext.fillText("100%", 25, 10);
    colorbarContext.fillText("75%", 25, 55);
    colorbarContext.fillText("50%", 25, 105);
    colorbarContext.fillText("25%", 25, 155);
    colorbarContext.fillText("0%", 25, 195);
}

function updateMetadata() {
    const metadata = d3.select("#metadata");
    metadata.html(`
                Aurora Forecast Map<br>
                Orthographic projection<br>
                Observation Time: ${auroraData["Observation Time"]}<br>
                Forecast Time: ${auroraData["Forecast Time"]}<br>
                Render Time: ${new Date().toISOString()}<br>
            `);
}

let v0, r0, q0;
let touchZoomStart, touchZoomScale;

canvas.call(d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged));

canvas.node().addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.node().addEventListener('touchmove', handleTouchMove, { passive: false });

function handleTouchStart(event) {
    event.preventDefault();
    const touches = event.touches;
    if (touches.length === 2) {
        touchZoomStart = pinchDistance(touches);
        touchZoomScale = projection.scale();
    }
}

function handleTouchMove(event) {
    event.preventDefault();
    const touches = event.touches;
    if (touches.length === 2) {
        const touchZoom = pinchDistance(touches);
        const newScale = touchZoomScale * touchZoom / touchZoomStart;
        projection.scale(Math.min(Math.max(newScale, 100), 5000));
        render();
    }
}

function pinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function dragstarted(event) {
    const p = d3.pointers(event, this)[0];
    v0 = versor.cartesian(projection.invert(p));
    r0 = projection.rotate();
    q0 = versor(r0);
}

function dragged(event) {
    const p = d3.pointers(event, this)[0];
    const v1 = versor.cartesian(projection.rotate(r0).invert(p));
    const q1 = versor.multiply(q0, versor.delta(v0, v1));
    projection.rotate(versor.rotation(q1));
    render();
}

function resizeMap() {
    width = window.innerWidth;
    height = window.innerHeight;
    scale = Math.min(width, height) / 2 - 10;

    d3.select("#globe")
        .attr("width", width)
        .attr("height", height);

    projection
        .scale(scale)
        .translate([width / 2, height / 2]);

    path = d3.geoPath().projection(projection).context(context);

    render();
}

window.addEventListener('resize', resizeMap);

// Show controls when mouse is over the map window
document.body.addEventListener('mouseover', function () {
    document.getElementById('controls').style.opacity = '1';
});

document.body.addEventListener('mouseout', function () {
    document.getElementById('controls').style.opacity = '0';
});

// Show user location when checkbox is changed
document.getElementById('show-location').addEventListener('change', render);

loadData();
