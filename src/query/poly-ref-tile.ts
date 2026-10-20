import type { NavMesh, NavMeshTile } from './nav-mesh';
import { getNodeRefIndex, getNodeRefType, type NodeRef, NodeType } from './node';

/** The tile of a poly node ref, or undefined when the ref is not a poly of a loaded tile (as getTileAndPolyByRef). */
export const getPolyRefTile = (navMesh: NavMesh, nodeRef: NodeRef): NavMeshTile | undefined => {
    if (getNodeRefType(nodeRef) !== NodeType.POLY) return undefined;

    const node = navMesh.nodes[getNodeRefIndex(nodeRef)];
    const tile = navMesh.tiles[node.tileId];

    if (!tile || node.polyIndex >= tile.polys.length) return undefined;

    return tile;
};
