var GraphRunner = (function(jQuery, d3) {
  /* Keep track of whether we're dragging or not, so we can
   * ignore mousover/mouseout events when a drag is in progress:*/
  var isNodeBeingDragged = false;
  window.addEventListener("mousedown", function(e) {
    if ($(e.target).closest("g.node").length)
      isNodeBeingDragged = true;
  }, true);
  window.addEventListener("mouseup", function(e) {
    isNodeBeingDragged = false;
  }, true);

  function Runner(options) {
    var trackers = options.trackers;
    var SVG_WIDTH = options.width;
    var SVG_HEIGHT = options.height;
    var hideFavicons = options.hideFavicons;

    // Create the SVG element and populate it with some basic definitions
    // LONGTERM TODO: Since this is static markup, move it to index.html?
    var vis = d3.select("#chart")
      .append("svg:svg")
        .attr("width", SVG_WIDTH)
        .attr("height", SVG_HEIGHT);

    var defs = vis.append("svg:defs");
    defs.append("svg:marker")
        .attr("id", "Triangle")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 10)
        .attr("refY", 5)
        .attr("markerUnits", "strokeWidth")
        .attr("markerWidth", 4*2)
        .attr("markerHeight", 3*2)
        .attr("orient", "auto")
        .append("svg:path")
          .attr("d", "M 0 0 L 10 5 L 0 10 z");

    var gradient = defs.append("svg:radialGradient")
      .attr("id", "glow-gradient")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%")
      .attr("fx", "50%")
      .attr("fy", "50%");

    gradient.append("svg:stop")
      .attr("offset", "0%")
      .attr("style", "stop-color:rgb(200, 240, 255);stop-opacity:1");

    gradient.append("svg:stop")
      .attr("offset", "100%")
      .attr("style", "stop-color:rgb(0,0,0);stop-opacity:0");

    vis.append("svg:g").attr("class", "links");
    vis.append("svg:g").attr("class", "nodes");

    // label goes on the top above the links and nodes
    vis.append("svg:path").attr("id", "domain-label");
    vis.append("svg:text").attr("id", "domain-label-text");

    function setDomainLink(target, d) {
      target.removeClass("tracker").removeClass("site");
      if (d.trackerInfo) {
        var TRACKER_INFO = "http://www.privacychoice.org/companies/index/";
        var trackerId = d.trackerInfo.network_id;
        target.attr("href", TRACKER_INFO + trackerId);
        target.addClass("tracker");
      } else {
        target.attr("href", "http://" + d.name);
        target.addClass("site");
      }
    }

    function showDomainInfo(d) {
      var className = d.name.replace(/\./g, '-dot-');
      var info = $("#domain-infos").find("." + className);

      $("#domain-infos .info").hide();

      // Instead of just cleraing out the domain info div and puttig in the new info each time,
      // create a clone of the template for each new domain, and re-use that create a clone for each domain and then re-use it if it's already
      // created. An optimization?
      if (!info.length) {
        info = $("#templates .info").clone();
        info.addClass(className);
        info.find(".domain").text(d.name);
        var img = $('<img>');
        if (d.trackerInfo) {
          var TRACKER_LOGO = "http://images.privacychoice.org/images/network/";
          var trackerId = d.trackerInfo.network_id;
          info.find("h2.domain").empty();
          img.attr("src", TRACKER_LOGO + trackerId + ".jpg").addClass("tracker");
        } else {
          img.attr("src", 'http://' + d.name + '/favicon.ico')
             .addClass("favicon");
        }
        setDomainLink(info.find("a.domain"), d);
        info.find("h2.domain").prepend(img);
        img.error(function() { img.remove(); });
        $("#domain-infos").append(info);

        // Set up callback functions for the block-this-site link and the whitelist link
        info.find(".block-link").click(function() {
          CollusionAddon.blockDomain(d.name);
        });
        info.find(".whitelist-link").click(function() {
          CollusionAddon.whitelistDomain(d.name);
        });
      }

      // List referrers, if any (sites that set cookies read by this site)
      var referrers = info.find(".referrers");
      var domains = findReferringDomains(d);
      if (domains.length) {
        var list = referrers.find("ul");
        list.empty();
        domains.forEach(function(d) {
          var item = $('<li><a></a></li>');
          setDomainLink(item.find("a").text(d.name), d);
          list.append(item);
        });
        referrers.show();
      } else {
        referrers.hide();
      }

      // List referees, if any (sites that read cookies set by this site)
      var referrees = info.find(".referrees");
      domains = [];
      vis.selectAll("line.from-" + d.index).each(function(e) {
        domains.push(e.target);
      });
      if (domains.length) {
        var list = referrees.find("ul");
        list.empty();
        domains.forEach(function(d) {
          var item = $('<li><a></a></li>');
          setDomainLink(item.find("a").text(d.name), d);
          list.append(item);
        });
        referrees.show();
      } else {
        referrees.hide();
      }

      info.show();
    }

    function nodeRadius(d) {
      var linkCount = selectReferringLinks(d)[0].length;
      return 12 + linkCount;
    }

    function createNodes(nodes, force) {

      /* Represent each site as a node consisting of an svg group <g>
       * containing a <circle> and an <image>, where the image shows
       * the favicon; circle size shows number of links, color shows
       * type of site. */

      function selectArcs(d) {
        return vis.selectAll("line.to-" + d.index +
                             ",line.from-" + d.index);
      }

      function getCircleClassForSite(d) {
        var classString;
        if (d.wasVisited) {
          classString = "visited";
        } else {
          classString = "site";
        }
        /* Return "tracker" for a red circle;
         * Temporarily disabling this feature
         * until we get a more up-to-date data source for it.*/

        return classString;
      }

      function getGroupClassForSite(d) {
        /* The g.node that wraps around the cicle, favicon, and glow will get
         * tagged with "cookie", "noncookie", or both, so we can show/hide the groups
         * based on filter settings.
         */
        var classString = "";
        if (d.cookie) {
          classString += " cookie";
        }
        if (d.noncookie) {
          classString += " noncookie";
        }
        return classString;
      }

      function showPopupLabel(d) {
        /* Show popup label to display domain name next to the circle.
         * The popup label is defined as a path so that it can be shaped not to overlap its circle
         * Cutout circle on left end, rounded right end, length dependent on length of text.
         * Get ready for some crazy math and string composition! */

        // arguments for a are: (rx ry x-axis-rotation large-arc-flag sweep-flag x y)
        var r = nodeRadius(d);
        var fontSize = Math.floor(4 * r / 5);
        var pathStartX = d.x + r;
        var pathStartY = d.y;
        var labelWidth = Math.floor( d.name.length * fontSize / 2  ) + 4;
        var reverseWidth = 0 - labelWidth - r;
        var rightRadius = Math.floor(r/2);
        var path = "M " + pathStartX + " " + pathStartY  // starting point
          + " l " + labelWidth + " 0"
          + " a " + rightRadius + " " + rightRadius + " 0 0 1 0 " + 2*rightRadius
          + " l " + reverseWidth + " 0"
          + " a " + r + " " + r + " 0 0 0 " + r + " " + (-2 * rightRadius);
        d3.select("#domain-label").classed("hidden", false)
        .attr("d", path)
        .attr("class", "round-border " + getCircleClassForSite(d));
        d3.select("#domain-label-text").classed("hidden", false)
          .attr("x", pathStartX + 4)
          .attr("y", pathStartY + Math.floor(r/2) + fontSize/4)
          .style("font-size", fontSize + "px")
          .text(d.name);
      }

      function getConnectedDomains(d) {
        var connectedDomains = [d.name];
        findReferringDomains(d).forEach( function(e) {
          connectedDomains.push(e.name);
        });
        vis.selectAll("line.from-" + d.index).each(function(e) {
          connectedDomains.push(e.target.name);
        });

        return connectedDomains;
      }

      var node = vis.select("g.nodes").selectAll("g.node")
          .data(nodes);

      node.transition()
          .duration(1000)
          .attr("r", nodeRadius);

      // For each node, create svg group <g> to hold circle, image, and title
      var gs = node.enter().append("svg:g")
          .attr("class", function(d) {return "node" + getGroupClassForSite(d);})
          .attr("transform", function(d) {
            // <g> doesn't take x or y attributes but it can be positioned with a transformation
            return "translate(" + d.x + "," + d.y + ")";
          })
          .on("mouseover", function(d) {
            if (isNodeBeingDragged)
              return;
            /* Hide all lines except the ones going in or out of this node;
             * make those ones bold and show the triangles on the ends;*/
            vis.selectAll("line").classed("hidden", true);
            selectArcs(d).attr("marker-end", "url(#Triangle)")
                  .classed("hidden", false).classed("bold", true);
            showDomainInfo(d);
            showPopupLabel(d);

            // Make directly-connected nodes opaque, the rest translucent:
            var subGraph = getConnectedDomains(d);
            d3.selectAll("g.node").classed("unrelated-domain", function(d) {
                return (subGraph.indexOf(d.name) == -1);
            });
          })
          .on("mouseout", function(d) {
            // TODO set the endpoints of lines back to the center I guess? or leave it, no biggie, see
                // what happens.
            vis.selectAll("line").classed("hidden", false);
            selectArcs(d).attr("marker-end", null).classed("bold", false);
            d3.selectAll("g.node").classed("unrelated-domain", false);
            d3.select("#domain-label").classed("hidden", true);
            d3.select("#domain-label-text").classed("hidden", true);
          })
          .on("click", function(d) {
            switchSidebar("#domain-infos");
          })
          .call(force.drag);


      // glow if site is visited
      gs.append("svg:circle")
        .attr("cx", "0")
        .attr("cy", "0")
        .attr("r", "30")
        .attr("class", "glow")
        .attr("fill", "url(#glow-gradient)")
        .classed("hidden", function(d) {
                return !d.wasVisited;
              });

      gs.append("svg:circle")
          .attr("cx", "0")
          .attr("cy", "0")
          .attr("r", nodeRadius)
          .attr("class", function(d) {
                return "node round-border " + getCircleClassForSite(d);
                });

      if (!hideFavicons) {
        // If hiding favicons ("TED mode"), show initial letter of domain instead of favicon
        gs.append("svg:image")
          .attr("class", "node")
          .attr("width", "16")
          .attr("height", "16")
          .attr("x", "-8") // offset to make 16x16 favicon appear centered
          .attr("y", "-8")
          .attr("xlink:href", function(d) {return 'http://' + d.name + '/favicon.ico'; } );
      }

      // Remove nodes if domain is removed from the data (e.g. user blocked it)
      node.exit().remove();
      // TODO: this doesn't seem to work at all. Debug more.

      return node;
    }

    function createLinks(links) {
      var getClassForLink = function(d) {
        var classString = "link from-" + d.source.index + " to-" + d.target.index;
        /* a link can have both "cookie" and "noncookie" - that would mean that connection happened
         * at least twice, using cookies one time and noncookie methods the other time. */
        if (d.cookie) {
          classString += " cookie";
        }
        if (d.noncookie) {
          classString += " noncookie";
        }
        return classString;
      };
      var link = vis.select("g.links").selectAll("line.link")
          .data(links)
        .enter().append("svg:line")
          .attr("class", getClassForLink)
          .style("stroke-width", 1)
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

      return link;
    }

    function draw(json) {
      var force = d3.layout.force()
          .charge(-500)
          .distance(120)
          .friction(0)
          .nodes(json.nodes)
          .links(json.links)
          .size([SVG_WIDTH, SVG_HEIGHT])
          .start();

      createLinks(json.links);
      createNodes(json.nodes, force);

      vis.style("opacity", 1e-6)
        .transition()
          .duration(1000)
          .style("opacity", 1);

      force.on("tick", function() {
        vis.selectAll("line.link").each(function(d) {
          // Line points from center of source circle to edge of target circle. Do some trigonometry
          // based on radius of target circle to figure out ending coordinates.
          var line = d3.select(this);
            var len = Math.sqrt( (d.source.x - d.target.x) * (d.source.x - d.target.x) +
                                 (d.source.y - d.target.y) * (d.source.y - d.target.y) );
              // TODO this is no good - reimplemenation of radius function, which is out of scope here
            var r = nodeRadius(d.target);

          line.attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x + Math.floor((d.source.x - d.target.x) * r / len); })
            .attr("y2", function(d) { return d.target.y + Math.floor((d.source.y - d.target.y) * r / len); });
        });

         vis.selectAll("g.node").attr("transform", function(d) {
            return "translate(" + d.x + "," + d.y + ")";
         });
      });

      return {
        vis: vis,
        force: force
      };
    }

    function selectReferringLinks(d) {
      return vis.selectAll("line.to-" + d.index);
    }

    function findReferringDomains(d, list, domain) {
      if (!list) {
        list = [];
        domain = d.name;
      }

      selectReferringLinks(d).each(function(d) {
        if (list.indexOf(d.source) == -1 &&
            d.source.name != domain) {
          list.push(d.source);
          findReferringDomains(d.source, list, domain);
        }
      });

      return list;
    }

    function CollusionGraph(trackers) {
      var nodes = [];
      var links = [];
      var domainIds = {};

      function getNodeId(domain) {
        if (!(domain in domainIds)) {
          domainIds[domain] = nodes.length;
          var trackerInfo = null;
          for (var i = 0; i < trackers.length; i++)
            if (trackers[i].domain == domain) {
              trackerInfo = trackers[i];
              break;
            }
          nodes.push({
            name: domain,
            trackerInfo: trackerInfo
          });
        }
        return domainIds[domain];
      }

      function addLink(options) {
        var fromId = getNodeId(options.from);
        var toId = getNodeId(options.to);
        var link = vis.select("line.to-" + toId + ".from-" + fromId);
        if (!link[0][0])
          links.push({source: fromId, target: toId, cookie: options.cookie, noncookie: options.noncookie});
        /* When building up the graph, mark the nodes and links as cookie-based, non-cookie-based,
         * or both. (If a link is cookie-based, the nodes at both ends are cookie-based, etc.)
         * This data will be used to attach appropriate classes to the SVG nodes. */
        if (options.cookie) {
          nodes[toId].cookie = true;
          nodes[fromId].cookie = true;
        }
        if (options.noncookie) {
          nodes[toId].noncookie = true;
          nodes[fromId].noncookie = true;
        }
      }

      var drawing = draw({nodes: nodes, links: links});

      return {
        data: null,
        update: function(json) {
          this.data = json;
          drawing.force.stop();

          for (var domain in json) {
            for (var referrer in json[domain].referrers) {
              var usedCookie = json[domain].referrers[referrer].cookie;
              var usedNonCookie = json[domain].referrers[referrer].noncookie;
              addLink({from: referrer, to: domain, cookie: usedCookie, noncookie: usedNonCookie});
            }
          }
          for (var n = 0; n < nodes.length; n++) {
            if (json[nodes[n].name]) {
              nodes[n].wasVisited = json[nodes[n].name].visited;
            } else {
              nodes[n].wasVisited = false;
            }

            /* For nodes that don't already have a position, initialize them near the center.
             * This way the graph will start from center. If it already has a position, leave it.
             * Note that initializing them all exactly at center causes there to be zero distance,
             * which makes the repulsive force explode!! So add some random factor. */
            if (typeof nodes[n].x == "undefined") {
              nodes[n].x = nodes[n].px = SVG_WIDTH / 2 + Math.floor( Math.random() * 50 ) ;
              nodes[n].y = nodes[n].py = SVG_HEIGHT / 2 + Math.floor( Math.random() * 50 );
            }
          }

          drawing.force.nodes(nodes);
          drawing.force.links(links);
          drawing.force.start();
          createLinks(links);
          createNodes(nodes, drawing.force);
        }
      };
    }

    function makeBufferedGraphUpdate(graph) {
      var timeoutID = null;

      return function(json) {
        // TODO this comparison sometimes throws:
        // TypeError: attempt to run compile-and-go script on a cleared scope
        if (timeoutID !== null)
          clearTimeout(timeoutID);
        timeoutID = setTimeout(function() {
          timeoutID = null;

          // This is for debugging purposes only!
          self.lastJSON = json;

          graph.update(json);
        }, 250);
        // TODO the setTimeout call sometimes throws:
        // Illegal operation on WrappedNative prototype object
      };
    }

    var graph = CollusionGraph(trackers);

    var self = {
      graph: graph,
      width: SVG_WIDTH,
      height: SVG_HEIGHT,
      updateGraph: makeBufferedGraphUpdate(graph)
    };

    return self;
  }

  var GraphRunner = {
    Runner: Runner
  };

  return GraphRunner;
})(jQuery, d3);
