import style from "./style.css";

function app() {
  let map = null;
  const directionsService = new google.maps.DirectionsService();
  // Instantiate an info window to hold time left text.
  const timeInfoWindow = new google.maps.InfoWindow();
  // this is populated on map init
  const directionsOptions = {};
  const markers = [];

  document.addEventListener(
    "markersReady",
    () => {
      directionsOptions.destination = markers[0].getPosition();
      directionsOptions.pointLatLong = markers[1].getPosition();
      setDirections(directionsOptions);

      timeInfoWindow.open(map, markers[1]);
    },
    { once: true }
  );

  document.addEventListener(
    "reachedPin",
    () => {
      setDirections({
        directionsDisplay: directionsOptions.directionsDisplay,
        car: directionsOptions.car,
        origin: directionsOptions.car.getPosition(),
        destination: markers[1].getPosition()
      });
    },
    { once: true }
  );

  function initMap() {
    // Create a map and center it on Nalichnaya
    map = new google.maps.Map(document.getElementById("map-canvas"), {
      zoom: 15,
      center: { lat: 59.941814, lng: 30.232328 }
    });

    google.maps.event.addListener(map, "click", function(event) {
      addMarker(event.latLng, map);
    });

    // Create a renderer for directions and bind it to the map.
    directionsOptions.directionsDisplay = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true
    });

    directionsOptions.car = addCar(map);

    directionsOptions.origin = directionsOptions.car.getPosition();
  }

  function updateHeading(car, nextPoint) {
    const path = [car.getPosition(), nextPoint];
    const heading = google.maps.geometry.spherical.computeHeading(
      path[0],
      path[1]
    );

    const icon = car.getIcon();
    icon.rotation = heading;

    car.setIcon(icon);
  }

  function setTimeToPoint(carLatLong, pointLatLong) {
    directionsService.route(
      {
        origin: carLatLong,
        destination: pointLatLong,
        travelMode: "DRIVING"
      },
      (response, status) => {
        if (status === "OK") {
          const route = response.routes[0];
          const routeData = route.legs[0];
          const { duration } = routeData;

          // it might not be able to get exactly to the place but if it is less than 5 seconds, we are here.
          if (duration.value > 5) {
            timeInfoWindow.setContent(
              `<div class='time-left-info'>${duration.text}</div>`
            );
          } else {
            timeInfoWindow.setContent(
              "<div class='time-left-info'>We are here!</div>"
            );
          }
        } else {
          console.log("Directions request failed due to " + status);
        }
      }
    );
  }

  function setDirections({ directionsDisplay, car, destination, origin }) {
    directionsService.route(
      {
        origin,
        destination,
        travelMode: "DRIVING"
      },
      (response, status) => {
        // Route the directions and pass the response to a function to create
        // markers for each step.
        if (status === "OK") {
          directionsDisplay.setDirections(response);

          const route = response.routes[0];
          const { overview_path: path } = route;

          travelPath(car, path, () => {
            const event = new Event("reachedPin");
            document.dispatchEvent(event);
          });
        } else {
          console.log("Directions request failed due to " + status);
        }
      }
    );
  }

  function travelPath(car, path, callback) {
    const waypoints = path;

    const [nextPoint] = waypoints.splice(0, 1);

    if (nextPoint) {
      moveCar(car, nextPoint, () => {
        travelPath(car, waypoints, callback);
      });
    } else {
      // let the passenger 3 seconds to jump in before we move to the next point
      const timeToJumpIn = 3000;
      setTimeout(() => {
        callback();
      }, timeToJumpIn);
    }
  }

  function moveCar(car, nextPoint, callback) {
    const carPosition = car.getPosition();
    const pointLatLong = markers[1].getPosition();

    setTimeToPoint(carPosition, pointLatLong);

    // meters per interval the auto passes. Roughly equal 50 km/h if the interval 100 ms
    const step = 1.38;

    updateHeading(car, nextPoint);

    let distance = google.maps.geometry.spherical.computeDistanceBetween(
      carPosition,
      nextPoint
    );

    // we need to move that many times to travel that distance
    const stepsNumber = distance / step;

    // the change in distance in terms of coordinates that we travel per step
    const deltaLat = (nextPoint.lat() - carPosition.lat()) / stepsNumber;
    const deltaLong = (nextPoint.lng() - carPosition.lng()) / stepsNumber;

    let lat = carPosition.lat();
    let long = carPosition.lng();

    // initial step
    let options = makeStep({
      car,
      lat,
      long,
      deltaLat,
      deltaLong,
      distance,
      step,
      nextPoint
    });

    const delay = 100;
    // call makeStep while it returns options, then we are done and call for new point
    const move = setInterval(() => {
      if (options) {
        options = makeStep(options);
      } else {
        clearInterval(move);
        callback();
      }
    }, delay);
  }

  // returns new options for the next call or false if we are done to the next point
  function makeStep({
    car,
    lat,
    long,
    deltaLat,
    deltaLong,
    distance,
    step,
    nextPoint
  }) {
    lat += deltaLat;
    long += deltaLong;

    distance -= step;

    if (distance > 0) {
      car.setPosition(new google.maps.LatLng(lat, long));

      return { car, lat, long, deltaLat, deltaLong, distance, step, nextPoint };
    } else {
      car.setPosition(nextPoint);

      return false;
    }
  }

  // Adds a marker to the map.
  // markers.length === 0 adding pin
  // markers.length === 1 adding point
  // markers.length === 2 done
  function addMarker(location, map) {
    let icon;

    if (markers.length === 0) {
      icon = "pin.png";
    } else if (markers.length === 1) {
      icon = "point.png";
    } else if (markers.length === 2) {
      return;
    }

    markers.push(
      new google.maps.Marker({
        position: location,
        map,
        icon
      })
    );

    if (markers.length === 2) {
      [directionsOptions.pinMarker, directionsOptions.pointMarker] = markers;

      const event = new Event("markersReady");
      document.dispatchEvent(event);
    }
  }

  function addCar(map) {
    const carLatLng = new google.maps.LatLng(59.944047, 30.230815);

    const car = new google.maps.Marker({
      position: carLatLng,
      map,
      icon: {
        path:
          "M6.69229825258255,-0.5405405759811406 H-5.066701747417452 c-3.117,0 -5.643,3.467 -5.643,6.584 v34.804 c0,3.116 2.526,5.644 5.643,5.644 h11.759 c3.116,0 5.644,-2.527 5.644,-5.644 V6.04345942401886 C12.334298252582549,2.9264594240188604 9.808298252582553,-0.5405405759811406 6.69229825258255,-0.5405405759811406 zM11.347298252582547,13.64745942401886 v11.665000000000001 l-2.729,0.3510000000000003 v-4.806 L11.347298252582547,13.64745942401886 zM9.915298252582552,10.23245942401886 c-1.016,3.9 -2.219,8.51 -2.219,8.51 H-6.071701747417451 l-2.222,-8.51 C-8.29270174741745,10.23245942401886 0.5902982525825493,7.214459424018861 9.915298252582552,10.23245942401886 zM-6.96170174741745,21.17245942401886 v4.492 l-2.73,-0.3490000000000011 V13.96145942401886 L-6.96170174741745,21.17245942401886 zM-9.69170174741745,37.39745942401886 V27.03845942401886 l2.73,0.34300000000000097 v8.196 L-9.69170174741745,37.39745942401886 zM-8.134701747417452,40.34145942401886 l2.218,-3.3360000000000003 h13.771 l2.219,3.3360000000000003 H-8.134701747417452 zM8.618298252582552,35.26445942401886 v-7.872 l2.729,-0.3550000000000003 v10.048 L8.618298252582552,35.26445942401886 z",
        scale: 1,
        strokeWeight: 0.2,
        strokeColor: "#000000",
        strokeOpacity: 1,
        fillColor: "#000000",
        fillOpacity: 0.7
      }
    });

    return car;
  }

  return { initMap };
}

const { initMap } = app();
initMap();
