# Scientific model

Astral Surveyor renders a **fictional, deterministic star system**. The bodies are not claimed as observed exoplanets. Their catalogue inputs are curated to be astrophysically plausible, while the measurements labelled `Derived` are calculated from those inputs at runtime.

This separation matters: a procedural universe can be internally consistent without pretending that generated values came from a telescope.

## Standards and classification

- Solar, terrestrial and Jovian reference values follow the [IAU 2015 Resolution B3 nominal conversion constants](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf).
- World classes follow the broad categories used by [NASA Exoplanet Exploration](https://science.nasa.gov/exoplanets/planet-types/): terrestrial, super-Earth, Neptunian and gas giant, with descriptive subclasses such as ocean, lava, desert and dwarf worlds.
- Internal calculations use SI units. Astronomical units, Earth masses, Earth radii and Jovian units are presentation-layer conversions.

## Catalogue inputs

Each generated body has a deterministic set of model inputs:

- mass and mean radius;
- rotation period and axial tilt;
- semi-major axis, eccentricity and inclination;
- Bond albedo;
- atmospheric surface pressure, scale height and volume fractions;
- a curated mean surface or reference-level temperature;
- surface palette, elevation scale, ring geometry and procedural seed.

Atmospheric composition and surface temperature are scenario assumptions, not observations. The Inspector labels their provenance accordingly.

## Derived measurements

For mass `M`, mean radius `R`, semi-major axis `a`, eccentricity `e`, host mass `M★`, luminosity `L★` and Bond albedo `A`:

| Measurement | Model |
| --- | --- |
| Mean density | `ρ = M / (4πR³ / 3)` |
| Surface gravity | `g = GM / R²` |
| Escape velocity | `vₑ = √(2GM / R)` |
| Orbital period | `P = 2π √(a³ / G(M★ + M))` |
| Mean orbital speed | `v ≈ √(G(M★ + M) / a)` |
| Periapsis / apoapsis | `a(1 − e)` / `a(1 + e)` |
| Relative stellar flux | `(L★ / L☉) / (a / AU)²` |
| Equilibrium temperature | `[L★(1 − A) / (16πσa²)]¼` |

Moon positions are evaluated in their parent-relative Keplerian orbit and then transformed into the star-system frame.

## Climate and habitability labels

Climate labels are conservative heuristics built from equilibrium temperature, curated surface temperature, atmospheric pressure and stellar flux. They are useful for exploration and comparison, but they are **not biosignature detections or full climate simulations**. A positive label means “interesting under this model”, not “inhabited”.

## Current limitations

- Keplerian two-body orbits; no long-term N-body perturbations or orbital resonances.
- No tidal evolution, magnetosphere, atmospheric escape or stellar weather model.
- Equilibrium temperature assumes uniform heat redistribution.
- Gas- and ice-giant radius/pressure values refer to a model reference level rather than a solid surface.
- Procedural textures communicate class and composition visually; they are not spectroscopic maps.

These boundaries are deliberately visible in the product so future numerical upgrades can replace individual approximations without changing the catalogue contract.
