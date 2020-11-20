var clickedItem = null;

(function(exports) {
    
    function getData(sceneGraph) {
        console.log(sceneGraph);
        console.log('... processing ...');
        removeDeactivatedObjects(sceneGraph);
        removeRotateXNodes(sceneGraph);
        let data = convertSceneGraphFormat(sceneGraph);
        console.log(data);
        return data;
    }

    exports.visualize = function(sceneGraph) {
        // reset SVG if it already existed
        document.getElementById("my_dataviz").innerHTML = '';
        
        let data = getData(sceneGraph);
        
        // set the dimensions and margins of the graph
        var width = window.innerWidth - 40;
        var height = window.innerHeight - 140;

        // append the svg object to the body of the page
        var svg = d3.select("#my_dataviz")
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", "translate(40,0)");  // bit of margin on the left = 40

        // create a tooltip
        var Tooltip = d3.select("#my_dataviz")
            .append("div")
            .style("opacity", 0)
            .attr("class", "tooltip")
            .style("background-color", "white")
            .style("border", "solid")
            .style("border-width", "2px")
            .style("border-radius", "5px")
            .style("padding", "5px")
            .style("pointer-events", "none");

        // Three function that change the tooltip when user hover / move / leave a cell
        var mouseover = function(event, d) {
            Tooltip
                .style("opacity", 1)
                .style("position", "absolute");
            d3.select(this)
                .style("stroke", "black")
                .style("opacity", 1)

            console.log('mouseover');
            
            showDistancesFrom(d.data.name, sceneGraph);
        };
        var mousemove = function(event, d) {
            let sceneNode = sceneGraph[d.data.name];
            let pos = getWorldPosition(sceneNode, 0);
            Tooltip
                .html("Position:<br> (" + pos.x/1000 + "m, " + pos.y/1000 + "m, " + pos.z/1000 + "m)")
                .style("left", event.clientX + 'px') //(d3.pointer(event)[0]+70) + "px")
                .style("top", event.clientY + 'px'); //(d3.pointer(event)[1]) + "px")
            
            d3.select(this)
                .attr("r", 20);

            console.log('mousemove');
        };
        var mouseleave = function(event, d) {
            
            Tooltip
                .style("opacity", 0);

            if (clickedItem) {
                if (clickedItem !== d.data.name) {
                    d3.select(this)
                        .style("stroke", "none")
                        .style("opacity", 0.8);
                } //else {
                //     d3.select(this)
                //         .style('r', 20);
                // }
                showDistancesFrom(clickedItem, sceneGraph);
                return;
            }

            console.log('mouseleave');

            svg.selectAll(".distanceText")
                .attr("visibility", "hidden");

            svg.selectAll('.node')
                .attr('opacity', '');
            
            svg.selectAll('.nodeCircle')
                .style("stroke", function(d) {
                    if (d.data.name === clickedItem) {
                        return "black";
                    } else {
                        return "";
                    }
                })
                .attr("r", 10)
        };
        var onClick = function(event, d) {
            console.log('clicked on ' + d.data.name);
            if (clickedItem && clickedItem === d.data.name) {
                clickedItem = null;
            } else {
                clickedItem = d.data.name;
            }
        };

        let rightOffset = 300;
        
        // read json data
        // d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/data_dendrogram.json", function(data) {

        var tree = d3.tree()
            .size([height, width - rightOffset]);
        
        // Create the cluster layout:
        var cluster = d3.cluster()
            .size([height, width - rightOffset]);  // 100 is the margin I will have on the right side

        // Give the data to this cluster layout:
        var root = d3.hierarchy(data, function(d) {
            return d.children;
        });
        
        if (useTree) {
            tree(root);
        } else {
            cluster(root);
        }
        
        // var scale = d3.scale.linear().domain([0, width - 300]).range([offset, width - 300]);
        
        // Add the links between nodes:
        svg.selectAll('path')
            .data( root.descendants().slice(1) )
            .enter()
            .append('path')
            .attr("d", function(d) {
                return "M" + d.y + "," + d.x
                    + "C" + (d.parent.y + 50) + "," + d.x
                    + " " + (d.parent.y + 150) + "," + d.parent.x // 50 and 150 are coordinates of inflexion, play with it to change links shape
                    + " " + d.parent.y + "," + d.parent.x;
            })
            .style("fill", 'none')
            .attr("stroke", '#ccc');
        
        // Add a circle for each node.
        var node = svg.selectAll("g")
            .data(root.descendants())
            .enter()
            .append("g")
            .attr('class', 'node')
            .attr("transform", function(d) {
                return "translate(" + d.y + "," + d.x + ")"
            })
            .append("circle")
            .attr('class', 'nodeCircle')
            .attr("r", 10)
            .style("stroke", function(d) {
                if (d.data.name === clickedItem) {
                    return "black";
                } else {
                    return "";
                }
            })
            .style("fill", function(d) {
                let type = sceneGraph[d.data.name].vehicleInfo.type;
                if (type === 'ROOT') {
                    return "#ffffff";
                } else if (type === 'object') {
                    return "rgb(255,0,124)";
                } else if (type === 'frame') {
                    return "rgb(0, 255, 0)";
                } else if (type === 'node') {
                    return "rgb(0, 255, 255)";
                }
            })
            // .attr("stroke", "black")
            .style("stroke-width", 2)
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on('click', onClick);

        svg.selectAll(".node")
            .append("text")
            .attr("dx", function(d) { return d.children ? -12 : 12; })
            .attr("dy", 3)
            .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
            .text(function(d) {
                let id = d.data.name;
                if (sceneGraph[id]) {
                    let name = sceneGraph[id].vehicleInfo.name;
                    if (name === 'ROOT') { return null; }
                    return name;
                }
                return id;
            });

        svg.selectAll(".node")
            .append("text")
            .attr("class", "distanceText")
            .attr("visibility", "hidden")
            .attr("dx", function(d) {
                if (d.data.name === 'ROOT') { return 20; }
                return d.children ? -6 : 12;
            })
            .attr("dy", 20)
            .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
            .text(function(d) {
                return "0";
            });
        
        if (clickedItem) {
            if (typeof sceneGraph[clickedItem] !== 'undefined') {
                showDistancesFrom(clickedItem, sceneGraph);
            } else {
                clickedItem = null;
            }
        }
    };
    
    function showDistancesFrom(id, sceneGraph) {
        var svg = d3.select("#my_dataviz");
        
        let otherIds = Object.keys(sceneGraph);
        otherIds.splice(otherIds.indexOf(id), 1);

        getDistanceOneToMany(id, otherIds, function(distances) {
            // console.log('received data', distances);

            // TODO: find max distance, min distance, affect style based on relative distance
            let minDist = Number.MAX_SAFE_INTEGER;
            let maxDist = Number.MIN_SAFE_INTEGER;

            for (let key in distances[id]) {
                let distance = distances[id][key];
                if (distance > maxDist) {
                    maxDist = distance;
                }
                if (distance < minDist) {
                    minDist = distance;
                }
            }

            console.log('closest: ' + minDist);
            console.log('furthest: ' + maxDist);

            let colorScale = d3.scaleLinear()
                .domain([minDist, maxDist])
                .range([1, 0.5]);

            let sizeScale = d3.scaleLinear()
                .domain([minDist, maxDist])
                .range([2, 1]);

            // // Create a scale: transform value in pixel
            // var x = d3.scaleLinear()
            //     .domain([0, 100])         // This is the min and the max of the data: 0 to 100 if percentages
            //     .range([0, 400]);       // This is the corresponding value I want in Pixel
            //
            // console.log(x(25));

            svg.selectAll(".distanceText")
                .attr("visibility", "visible")
                .text(function (d2) {
                    let distance = distances[id][d2.data.name];
                    if (typeof distance !== 'undefined') {
                        return (distance / 1000).toFixed(2) + 'm';
                    }
                    return "";
                });

            svg.selectAll('.node')
                .attr('opacity', function (d2) {
                    let distance = distances[id][d2.data.name];
                    if (typeof distance !== 'undefined') {
                        return colorScale(distance);
                    }
                    return 1;
                });

            svg.selectAll('.nodeCircle')
                .attr("r", function (d2) {
                    let distance = distances[id][d2.data.name];
                    if (typeof distance !== 'undefined') {
                        if (d2.data.name === clickedItem) {
                            return 20;
                        }
                        return 10 * sizeScale(distance);
                    }
                    return 10;
                });
        });
    }

    function convertSceneGraphFormat(sceneGraph) {
        /*
        {"children":[{"name":"boss1","children":[{"name":"mister_a","colname":"level3"},{"name":"mister_b","colname":"level3"},{"name":"mister_c","colname":"level3"},{"name":"mister_d","colname":"level3"}],"colname":"level2"},{"name":"boss2","children":[{"name":"mister_e","colname":"level3"},{"name":"mister_f","colname":"level3"},{"name":"mister_g","colname":"level3"},{"name":"mister_h","colname":"level3"}],"colname":"level2"}],"name":"CEO"}
         */
        
        // let jsonData = {
        //     children: []
        // };
        let rootNode = sceneGraph['ROOT'];
        return convertNodeToJson(sceneGraph, rootNode);
        // return jsonData;
    }
    
    function convertNodeToJson(sceneGraph, node) {
        let convertedChildren = [];
        node.children.forEach(function(id) {
            let node = sceneGraph[id];
            if (!node) { return; }
            convertedChildren.push(convertNodeToJson(sceneGraph, node));
            // console.log(convertedChildren);
        });
        return {
            name: node.id,
            children: convertedChildren
        }
    }
    
    function removeDeactivatedObjects(sceneGraph) {
        let keysToRemove = [];
        Object.keys(sceneGraph).forEach(function(key) {
            let node = sceneGraph[key];
            if (node.deactivated) {
                keysToRemove.push(key);
                if (node.parent) {
                    let parentNode = sceneGraph[node.parent];
                    if (parentNode) {
                        let index = parentNode.children.indexOf(key);
                        parentNode.children.splice(index, 1);
                    }
                }
            }
        });
        keysToRemove.forEach(function(key) {
            console.log('remove deactivated ' + key + ' from ' + sceneGraph[key].parent);
            delete sceneGraph[key];
        });
    }
    
    function removeRotateXNodes(sceneGraph) {
        // adjust all parents
        Object.keys(sceneGraph).forEach(function(key) {
            let node = sceneGraph[key];
            if (node.parent && node.parent.includes('rotateX')) {
                let rotateX = sceneGraph[node.parent];
                node.parent = rotateX.parent;
            }
        });
        
        // adjust all children
        Object.keys(sceneGraph).forEach(function(key) {
            let node = sceneGraph[key];
            
            let rotateId = null;
            if (node.children.some( function(childId) {
                if (!childId) { return; }
                if (childId.includes('rotateX')) {
                    rotateId = childId;
                }
                return rotateId; // keep iterating until you find a draggable frame
            })) {
                let rotateX = sceneGraph[rotateId];
                // node.children = rotateX.children;
                if (rotateX) {
                    node.children.push.apply(node.children, rotateX.children);
                }
            }
        });
        
        // remove rotateX
        let keysToRemove = [];
        Object.keys(sceneGraph).forEach(function(key) {
            if (key.includes('rotateX')) {
                keysToRemove.push(key);
            }
        });
        keysToRemove.forEach(function(key) {
            // console.log('remove ' + key + ' from ' + sceneGraph[key].parent);
            delete sceneGraph[key];
        });
    }

    function getWorldPosition(sceneNode, decimals) {
        let numDecimals = (typeof decimals !== 'undefined') ? decimals : 3;
        return {
            x: (sceneNode.worldMatrix[12]/sceneNode.worldMatrix[15]).toFixed(decimals),
            y: (sceneNode.worldMatrix[13]/sceneNode.worldMatrix[15]).toFixed(decimals),
            z: (sceneNode.worldMatrix[14]/sceneNode.worldMatrix[15]).toFixed(decimals)
        }
    }
    
})(window);
