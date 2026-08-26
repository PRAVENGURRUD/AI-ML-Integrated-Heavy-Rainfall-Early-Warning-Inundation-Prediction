/**
 * Manually curated vulnerable regions for all 10 Tamil Nadu districts covered by the FVI tool.
 * Based on visual inspection of the FVI vulnerability maps, cross-checked against
 * documented flood/cyclone history (2015 Chennai floods, Cyclone Vardah 2016,
 * Cyclone Nivar 2020, Cyclone Michaung 2023, Cyclone Fengal 2024).
 * Red/Dark orange areas = Very High/High risk
 * Light orange/Yellow areas = Moderate risk
 */

const VULNERABLE_REGIONS = {
  all: [],
  
  // EXISTING 5 DISTRICTS WITH DETAILED DATA
  chennai: [
    {
      region: 'Velachery',
      risk: 'Very High',
      note: 'Low-lying urban basin with recurring severe monsoon flooding and poor drainage.'
    },
    {
      region: 'Adyar',
      risk: 'Very High',
      note: 'River floodplain and estuary with high flood susceptibility.'
    },
    {
      region: 'Pallikaranai',
      risk: 'Very High',
      note: 'Marshland ecosystem with extensive waterlogging during heavy rainfall.'
    },
    {
      region: 'Guindy',
      risk: 'High',
      note: 'Urban area influenced by low elevation and heavy surface runoff.'
    },
    {
      region: 'T. Nagar',
      risk: 'High',
      note: 'Dense commercial area prone to urban flooding.'
    }
  ],

  cuddalore: [
    {
      region: 'Cuddalore Town',
      risk: 'Very High',
      note: 'Major coastal urban centre exposed to river and coastal flooding.'
    },
    {
      region: 'Devanampattinam',
      risk: 'Very High',
      note: 'Low-lying coastal settlement highly susceptible to inundation.'
    },
    {
      region: 'Parangipettai',
      risk: 'High',
      note: 'River-mouth settlement affected by tidal and monsoon flooding.'
    },
    {
      region: 'Chidambaram',
      risk: 'High',
      note: 'Flood-prone area influenced by surrounding drainage channels.'
    },
    {
      region: 'Bhuvanagiri',
      risk: 'Moderate',
      note: 'Moderately flood-prone inland region with relatively higher elevation.'
    }
  ],

  nagapattinam: [
    {
      region: 'Nagapattinam',
      risk: 'Very High',
      note: 'Highly flood-prone coastal municipality with repeated cyclone impacts.'
    },
    {
      region: 'Velankanni',
      risk: 'Very High',
      note: 'Low-lying coastal town vulnerable to storm surge and monsoon flooding.'
    },
    {
      region: 'Vedaranyam',
      risk: 'Very High',
      note: 'Extensive coastal wetlands and extremely low elevation.'
    },
    {
      region: 'Kodiakkarai (Point Calimere)',
      risk: 'Very High',
      note: 'Coastal wetland ecosystem with high inundation potential.'
    },
    {
      region: 'Mayiladuthurai Coastal Belt',
      risk: 'High',
      note: 'Deltaic coastal plain affected by river discharge and heavy rainfall.'
    }
  ],

  ramanathapuram: [
    {
      region: 'Mandapam',
      risk: 'Very High',
      note: 'Low-lying coastal area with strong marine influence.'
    },
    {
      region: 'Rameswaram',
      risk: 'Very High',
      note: 'Island region highly exposed to cyclones and coastal flooding.'
    },
    {
      region: 'Pamban',
      risk: 'Very High',
      note: 'Narrow coastal corridor vulnerable to storm surge and tidal inundation.'
    },
    {
      region: 'Keelakarai',
      risk: 'High',
      note: 'Coastal settlement with significant flood exposure.'
    },
    {
      region: 'RS Mangalam',
      risk: 'Moderate',
      note: 'Moderately vulnerable inland region with localized flood susceptibility.'
    }
  ],

  kanniyakumari: [
    {
      region: 'Cape Comorin (Kanyakumari)',
      risk: 'High',
      note: 'Coastal zone exposed to intense rainfall, wave action, and flooding.'
    },
    {
      region: 'Nagercoil',
      risk: 'Moderate',
      note: 'Urban center experiencing localized flooding in low-lying areas.'
    },
    {
      region: 'Colachel',
      risk: 'Moderate',
      note: 'Coastal fishing town with moderate flood susceptibility.'
    }
  ],

  // NEW DISTRICTS — filled in from the FVI map screenshots, cross-checked
  // against documented flood/cyclone history for each area.
  kanchipuram: [
    {
      region: 'Guduvancheri',
      risk: 'Very High',
      note: 'Adyar floodplain corridor; inundated up to 7m deep during the 2015 Chennai floods.'
    },
    {
      region: 'Perungalathur',
      risk: 'Very High',
      note: 'Low-lying urbanized zone on the Chennai border with recurring severe flooding.'
    },
    {
      region: 'Kelambakkam–Navalur',
      risk: 'High',
      note: 'Fast-urbanizing OMR IT corridor with poor natural drainage and marsh encroachment.'
    }
  ],

  tiruvallur: [
    {
      region: 'Ponneri',
      risk: 'Very High',
      note: 'Near the Kosasthalaiyar river mouth; recorded 370mm of rain in 24 hours during the 2015 floods.'
    },
    {
      region: 'Gummidipoondi',
      risk: 'Very High',
      note: 'Low-lying industrial belt bordering Pulicat Lake, prone to backwater flooding.'
    },
    {
      region: 'Ennore–Minjur',
      risk: 'High',
      note: 'Creek-side settlements hit hard by the 2015 floods and the Cyclone Vardah storm surge in 2016.'
    }
  ],

  thoothukudi: [
    {
      region: 'Thoothukudi Town',
      risk: 'Very High',
      note: 'Port city with low-lying streets; flooded repeatedly during northeast monsoon depressions.'
    },
    {
      region: 'Tiruchendur',
      risk: 'High',
      note: 'Coastal temple town hit by heavy rain and flooding during Cyclone Michaung (2023) and other events.'
    },
    {
      region: 'Kayalpattinam',
      risk: 'High',
      note: 'Coastal fishing town on the Thamirabarani floodplain, exposed to both river and tidal flooding.'
    }
  ],

  // NOTE: the FVI screenshot reviewed for this district only shows the
  // southern coastal tip (Koodankulam/Idinthakarai). Tirunelveli's most
  // severe documented flooding (Cyclone Michaung, Dec 2023) actually hit
  // the Thamirabarani river corridor and Tirunelveli city further inland/
  // north, which sits outside this tool's coastal elevation-based analysis
  // zone — so it won't show up as a high-risk area here even though it's
  // the district's real flood hotspot. Worth keeping in mind if this list
  // is used for anything beyond the coastal strip.
  tirunelveli: [
    {
      region: 'Koodankulam–Idinthakarai',
      risk: 'Moderate',
      note: 'Southern coastal tip near the nuclear plant; moderate exposure to storm surge.'
    },
    {
      region: 'Kuthenkully',
      risk: 'Moderate',
      note: 'Small coastal settlement with seasonal waterlogging.'
    },
    {
      region: 'Uvari',
      risk: 'Moderately Low',
      note: 'Coastal fishing hamlet with comparatively better natural drainage.'
    }
  ],

  villupuram: [
    {
      region: 'Kaliveli (Kazhuveli) Lake belt',
      risk: 'Very High',
      note: 'Wetland/lagoon zone with severe backwater inundation — the reddest area on the map.'
    },
    {
      region: 'Marakkanam',
      risk: 'High',
      note: 'Coastal town where Cyclone Nivar made landfall in 2020; recurring storm surge exposure.'
    },
    {
      region: 'Koonimedu',
      risk: 'Moderate',
      note: 'Coastal fishing hamlet south of Marakkanam with moderate flood susceptibility.'
    }
  ],

  pudukkottai: [
    {
      region: 'Aranthangi',
      risk: 'Moderate',
      note: 'Coastal settlement near Palk Strait; moderate exposure to tidal and storm surge flooding.'
    },
    {
      region: 'Vedaranyam–Karaikal zone',
      risk: 'Moderate',
      note: 'Low-lying coastal belt on southern boundary, vulnerable to northeast monsoon rain and sea ingress.'
    },
    {
      region: 'Pudukkottai Town',
      risk: 'Moderately Low',
      note: 'District headquarters with mixed elevation; localized waterlogging in low-lying pockets.'
    }
  ],

  thanjavur: [
    {
      region: 'Mayiladuthurai',
      risk: 'High',
      note: 'Coastal port town on Cauvery delta; exposed to storm surge and backwater flooding from Kollidam River.'
    },
    {
      region: 'Thiruvarur',
      risk: 'High',
      note: 'Low-lying delta area with river and canal networks; prone to monsoon-driven inundation and river overflow.'
    },
    {
      region: 'Nagore–Vedaranyam coast',
      risk: 'Moderate',
      note: 'Fishing villages along the Palk Strait with seasonal tidal and storm surge exposure.'
    }
  ]

};


/**
 * Risk level color mapping
 */
const RISK_COLORS = {
  'Very High': '#dc2626',
  'High': '#f97316',
  'Moderate': '#eab308',
  'Moderately Low': '#84cc16',
  'Low': '#22c55e',
};

const RISK_EMOJIS = {
  'Very High': '🔴',
  'High': '🟠',
  'Moderate': '🟡',
  'Moderately Low': '🟢',
  'Low': '🟢',
};

export { VULNERABLE_REGIONS, RISK_COLORS, RISK_EMOJIS };