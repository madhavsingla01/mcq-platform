export function requestSessionLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: 0, timeout: 5000 }
      );
    } catch {
      resolve(null);
    }
  });
}
