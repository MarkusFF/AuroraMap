let width = window.innerWidth;
let height = window.innerHeight;
let scale = Math.min(width, height) / 2 - 10;

const COUNTRY_FILL = "#90EE9005";
const SPHERE_FILL = "rgba(0, 0, 0, 0.1)";
const COUNTRY_BORDER_STROKE = "#444444";

// Cache DOM elements
const globeCanvas = d3.select("#globe");
const context = globeCanvas.node().getContext("2d");
const metadataElement = d3.select("#metadata");
const colorbarContainer = document.getElementById('colorbar-container');
const showLocationCheckbox = document.getElementById('show-location');
const fadeColorbarCheckbox = document.getElementById('fade-colorbar');
const fadeInfoCheckbox = document.getElementById('fade-info');
const autoRefreshCheckbox = document.getElementById('auto-refresh');

let projection, path;
let world, auroraData;
let userLocation = null;

const colorScale = d3.scaleSequential(d3.interpolatePlasma)
    .domain([0, 100]);

let animationFrameId = null;
let needsRender = true;
let isDataLoaded = false;
let isInitialized = false;
let autoRefreshInterval;

const autoRefreshTime = 600000/10;

function loadAuroraData() {
    clearInterval(autoRefreshInterval);
    return d3.json("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json")
        .then(function(aurora) {
            auroraData = aurora;
            updateMetadata();
            requestRender();
            if (autoRefreshCheckbox.checked) {
                autoRefreshInterval = setInterval(loadAuroraData, autoRefreshTime); // 10 minutes
            }
        })
        .catch(function(error) {
            console.error("Error loading aurora data:", error);
        });
}

function loadData() {
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
        .then(function(worldData) {
            world = worldData;
            isDataLoaded = true;
            getUserLocation();
            drawColorbar();
            initializeGlobe();
            resizeMap();
            return loadAuroraData();
        })
        .catch(function(error) {
            console.error("Error loading world data:", error);
        });
}

function initializeGlobe() {
    if (!isDataLoaded) return;

    projection = d3.geoOrthographic()
        .scale(scale)
        .translate([width / 2, height / 2]);

    path = d3.geoPath().projection(projection).context(context);

    globeCanvas.call(d3.drag()
        .on("start", handleInteractionStart)
        .on("drag", handleInteractionMove)
        .on("end", handleInteractionEnd));

    globeCanvas.node().addEventListener('touchstart', handleInteractionStart, { passive: false });
    globeCanvas.node().addEventListener('touchmove', handleInteractionMove, { passive: false });
    globeCanvas.node().addEventListener('touchend', handleInteractionEnd, { passive: false });

    isInitialized = true;
    requestRender();
}

function getUserLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(function (position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            userLocation = [longitude, latitude];
            projection.rotate([-longitude, -latitude]);
            requestRender();
        }, function (error) {
            console.error("Error getting user location:", error);
        });
    } else {
        console.log("Geolocation is not available");
    }
}

function render() {
    if (!needsRender || !isDataLoaded || !isInitialized) return;
    
    context.clearRect(0, 0, width, height);

    // Draw the globe
    context.beginPath();
    path({ type: "Sphere" });
    context.fillStyle = SPHERE_FILL;
    context.fill();
    // Add white outline to the globe
    context.strokeStyle = "white";
    context.lineWidth = 1;
    context.stroke();

    // Draw graticules
    const graticule = d3.geoGraticule()
        .stepMajor([90, 90])
        .stepMinor([45, 45]);

    context.beginPath();
    path(graticule());
    context.lineWidth = 0.5;
    context.strokeStyle = "rgba(255, 255, 255, 1)";
    context.stroke();

    // Pre-calculate center point
    const [cx, cy] = projection.invert([width / 2, height / 2]);

    // Draw aurora
    if (auroraData && auroraData.coordinates) {
        auroraData.coordinates.forEach(d => {
            const [lon, lat] = d.slice(0, 2);
            const geoDistance = d3.geoDistance([lon, lat], [cx, cy]);
            if (d[2] > 0 && geoDistance < Math.PI / 2) {
                const [x, y] = projection([lon, lat]);
                if (x !== null && y !== null) {
                    drawAuroraPoint(x, y, d[2]);
                }
            }
        });
    }

    // Draw countries
    if (world && world.objects && world.objects.countries) {
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
    }

    // Draw coastlines
    if (world && world.objects && world.objects.land) {
        context.beginPath();
        path(topojson.feature(world, world.objects.land));
        context.strokeStyle = "white";
        context.lineWidth = 0.5;
        context.stroke();
    }

    // Draw user location if checkbox is checked
    if (showLocationCheckbox.checked && userLocation) {
        const [x, y] = projection(userLocation);
        context.beginPath();
        context.arc(x, y, 5, 0, 2 * Math.PI);
        context.fillStyle = 'red';
        context.fill();
        context.strokeStyle = 'white';
        context.lineWidth = 2;
        context.stroke();
    }

    needsRender = false;
}

function drawAuroraPoint(x, y, intensity) {
    context.beginPath();
    const size = Math.min(width, height)/100;
    context.arc(x, y, size, 0, 2 * Math.PI);
    context.fillStyle = colorScale(intensity);
    context.globalAlpha = intensity / 100;
    context.fill();
    context.globalAlpha = 1;
}

function drawColorbar() {
    const colorbarCanvas = d3.select("#colorbar");
    const colorbarWidth = document.getElementById('colorbar-container').clientWidth;
    colorbarCanvas.attr("width", colorbarWidth).attr("height", 50);
    
    const colorbarContext = colorbarCanvas.node().getContext("2d");
    const gradient = colorbarContext.createLinearGradient(0, 0, colorbarWidth, 0);

    for (let i = 0; i <= 1; i += 0.01) {
        gradient.addColorStop(i, colorScale(i * 100));
    }

    colorbarContext.fillStyle = gradient;
    colorbarContext.fillRect(0, 0, colorbarWidth, 20);

    // Add labels
    colorbarContext.fillStyle = "white";
    colorbarContext.font = "12px Arial";
    
    colorbarContext.textAlign = "center";
    colorbarContext.fillText("0%", 10, 45);
    colorbarContext.fillText("25%", colorbarWidth * 0.25, 45);
    colorbarContext.fillText("50%", colorbarWidth * 0.5, 45);
    colorbarContext.fillText("75%", colorbarWidth * 0.75, 45);
    colorbarContext.fillText("100%", colorbarWidth - 10, 45);
}
function updateMetadata() {
    metadataElement.html(`
        Aurora Forecast Map<br>
        Orthographic projection<br>
        Observation Time: ${auroraData["Observation Time"]}<br>
        Forecast Time: ${auroraData["Forecast Time"]}<br>
        Render Time: ${new Date().toISOString()}<br>
    `);
}

function resizeMap() {
    const container = document.getElementById('container');
    width = container.clientWidth;
    height = document.getElementById('map').clientHeight;
    scale = Math.min(width, height) / 2 - 10;

    globeCanvas
        .attr("width", width)
        .attr("height", height);

    if (isInitialized) {
        projection
            .scale(scale)
            .translate([width / 2, height / 2]);

        path = d3.geoPath().projection(projection).context(context);

        requestRender();
        drawColorbar();
    }
    requestRender();
}

function animate() {
    render();
    animationFrameId = requestAnimationFrame(animate);
}

function startAnimation() {
    if (!animationFrameId) {
        animate();
    }
}

function stopAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function requestRender() {
    needsRender = true;
    startAnimation();
}

// Consolidated touch and drag handling
let v0, r0, q0;
let touchZoomStart, touchZoomScale;

function handleInteractionStart(event) {
    if (event.type === 'touchstart') {
        event.preventDefault();
        const touches = event.touches;
        if (touches.length === 2) {
            touchZoomStart = pinchDistance(touches);
            touchZoomScale = projection.scale();
        }
    } else {
        const p = d3.pointers(event, globeCanvas.node())[0];
        v0 = versor.cartesian(projection.invert(p));
        r0 = projection.rotate();
        q0 = versor(r0);
    }
    startAnimation();
}

function handleInteractionMove(event) {
    if (event.type === 'touchmove') {
        event.preventDefault();
        const touches = event.touches;
        if (touches.length === 2) {
            const touchZoom = pinchDistance(touches);
            const newScale = touchZoomScale * touchZoom / touchZoomStart;
            projection.scale(Math.min(Math.max(newScale, 100), 5000));
        } else if (touches.length === 1) {
            const p = [touches[0].clientX, touches[0].clientY];
            const v1 = versor.cartesian(projection.rotate(r0).invert(p));
            const q1 = versor.multiply(q0, versor.delta(v0, v1));
            projection.rotate(versor.rotation(q1));
        }
    } else {
        const p = d3.pointers(event, globeCanvas.node())[0];
        const v1 = versor.cartesian(projection.rotate(r0).invert(p));
        const q1 = versor.multiply(q0, versor.delta(v0, v1));
        projection.rotate(versor.rotation(q1));
    }
    requestRender();
}

function handleInteractionEnd() {
    stopAnimation();
}

function pinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleMouseOver() {
    document.getElementById('controls').classList.remove('fade');
    document.getElementById('info-section').classList.remove('fade');
}

function handleMouseOut() {
    document.getElementById('controls').classList.add('fade');
    if (fadeColorbarCheckbox.checked || fadeInfoCheckbox.checked) {
        document.getElementById('info-section').classList.add('fade');
    }
}
function toggleAutoRefresh() {
    if (autoRefreshCheckbox.checked) {
        loadAuroraData();
    } else {
        clearInterval(autoRefreshInterval);
    }
}

// Event listeners
window.addEventListener('resize', resizeMap);
document.body.addEventListener('mouseover', handleMouseOver);
document.body.addEventListener('mouseout', handleMouseOut);
showLocationCheckbox.addEventListener('change', requestRender);
fadeColorbarCheckbox.addEventListener('change', handleMouseOver);
fadeInfoCheckbox.addEventListener('change', handleMouseOver);
autoRefreshCheckbox.addEventListener('change', toggleAutoRefresh);

// Initialize
loadData();
