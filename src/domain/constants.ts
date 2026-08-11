/** SI and astronomical constants used by the simulation domain. */
export const TAU = Math.PI * 2
export const GRAVITATIONAL_CONSTANT = 6.674_30e-11
export const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458
export const JULIAN_DAY_SECONDS = 86_400
export const JULIAN_YEAR_SECONDS = 365.25 * JULIAN_DAY_SECONDS
export const ASTRONOMICAL_UNIT_METERS = 149_597_870_700
export const LIGHT_YEAR_METERS =
  SPEED_OF_LIGHT_METERS_PER_SECOND * JULIAN_YEAR_SECONDS
export const PARSEC_METERS = 3.085_677_581_491_367e16

/**
 * Exact nominal conversion constants from IAU 2015 Resolution B3.
 * They are conversion factors, not current best estimates of Solar-System bodies.
 * https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf
 */
export const IAU_NOMINAL_SOLAR_RADIUS_METERS = 6.957e8
export const IAU_NOMINAL_SOLAR_IRRADIANCE_WATTS_PER_SQUARE_METER = 1_361
export const IAU_NOMINAL_SOLAR_LUMINOSITY_WATTS = 3.828e26
export const IAU_NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_KELVIN = 5_772
export const IAU_NOMINAL_SOLAR_MASS_PARAMETER = 1.327_124_4e20
export const IAU_NOMINAL_EARTH_EQUATORIAL_RADIUS_METERS = 6.3781e6
export const IAU_NOMINAL_EARTH_POLAR_RADIUS_METERS = 6.3568e6
export const IAU_NOMINAL_EARTH_MASS_PARAMETER = 3.986_004e14
export const IAU_NOMINAL_JUPITER_EQUATORIAL_RADIUS_METERS = 7.1492e7
export const IAU_NOMINAL_JUPITER_POLAR_RADIUS_METERS = 6.6854e7
export const IAU_NOMINAL_JUPITER_MASS_PARAMETER = 1.266_865_3e17

export const STEFAN_BOLTZMANN_CONSTANT = 5.670_374_419e-8
export const STANDARD_GRAVITY_METERS_PER_SECOND_SQUARED = 9.806_65

/** Approximate SI mass retained for compatibility; IAU nominal mass uses GM above. */
export const SOLAR_MASS_KILOGRAMS = 1.988_47e30
export const SOLAR_RADIUS_METERS = IAU_NOMINAL_SOLAR_RADIUS_METERS
/** Approximate current-best-estimate mass and mean radius, not IAU nominal conversions. */
export const EARTH_MASS_KILOGRAMS = 5.972_2e24
export const EARTH_RADIUS_METERS = 6_371_000
/** Approximate current-best-estimate mass and volumetric mean radius. */
export const JUPITER_MASS_KILOGRAMS = 1.898_13e27
export const JUPITER_RADIUS_METERS = 69_911_000
